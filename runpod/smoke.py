# Prueba de humo en la GPU real antes de dar el pod por listo: ejercita por la API de ComfyUI
# la parte final del workflow (VAEDecode de video int8 + VAEDecodeAudio) con un latente pequeno,
# y SageAttention con tensores pequenos. Sale con 1 y el error exacto si algo falla.
import json, sys, time, uuid, urllib.request as u

BASE = "http://127.0.0.1:8188"
VAE_VIDEO = "minimax_h3_video_vae_int8_convrot.safetensors"
VAE_AUDIO = "minimax_h3_audio_vae_fp32.safetensors"


def post(path, data):
    r = u.Request(BASE + path, json.dumps(data).encode(), headers={"Content-Type": "application/json"})
    return json.load(u.urlopen(r, timeout=60))


def get(path):
    return json.load(u.urlopen(BASE + path, timeout=60))


def prueba_vae():
    g = {
        "1": {"class_type": "VAELoader", "inputs": {"vae_name": VAE_VIDEO}},
        "2": {"class_type": "VAELoader", "inputs": {"vae_name": VAE_AUDIO}},
        "3": {"class_type": "EmptyMiniMaxH3LatentAV", "inputs": {"width": 512, "height": 288, "length": 22}},
        "4": {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0], "vae": ["1", 0]}},
        "5": {"class_type": "VAEDecodeAudio", "inputs": {"samples": ["3", 0], "vae": ["2", 0]}},
        "6": {"class_type": "PreviewImage", "inputs": {"images": ["4", 0]}},
        "7": {"class_type": "PreviewAudio", "inputs": {"audio": ["5", 0]}},
    }
    r = post("/prompt", {"prompt": g, "client_id": str(uuid.uuid4())})
    if r.get("node_errors"):
        return f"grafo invalido: {r['node_errors']}"
    pid, t0 = r["prompt_id"], time.time()
    while time.time() - t0 < 600:
        h = get(f"/history/{pid}").get(pid)
        if h and h.get("status", {}).get("completed") is not None:
            st = h["status"]
            if st.get("status_str") == "success":
                return None
            for kind, m in st.get("messages", []):
                if kind == "execution_error":
                    return f"{m.get('node_type')}: {m.get('exception_message', '').strip()}"
            return f"fallo sin detalle: {st}"
        time.sleep(2)
    return "VAE: sin respuesta en 10 min"


def prueba_sage():
    try:
        import torch
        from sageattention import sageattn
    except ImportError:
        return None  # sin SageAttention instalado (modo cu130 usa comfy-kitchen)
    try:
        q, k, v = (torch.randn(1, 8, 256, 64, device="cuda", dtype=torch.float16) for _ in range(3))
        out = sageattn(q, k, v, tensor_layout="HND")
        torch.cuda.synchronize()
        ref = torch.nn.functional.scaled_dot_product_attention(q, k, v)
        err = (out.float() - ref.float()).abs().max().item()
        return None if err < 0.1 else f"SageAttention da resultados erroneos (error max {err:.3f})"
    except Exception as e:
        return f"SageAttention: {type(e).__name__}: {e}"


fallos = [f for f in (prueba_vae(), prueba_sage()) if f]
if fallos:
    print("; ".join(fallos))
    sys.exit(1)
print("VAE video+audio y SageAttention funcionan en la GPU")
