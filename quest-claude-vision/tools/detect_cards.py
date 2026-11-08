"""Runs the app's card detector on photos from a computer, to tune detection offline.

Mirrors the Kotlin pipeline (poker/CardModel.kt): letterbox to 640x640, YOLOv8 ONNX,
decode, per-card NMS. Optionally only the central half, like the app's zoom mode.
Writes a copy of every image with boxes drawn, and prints the cards found.

    pip install onnxruntime numpy pillow
    python tools/detect_cards.py app/src/main/assets/cards.onnx out/ frame1.jpg frame2.jpg [--zoom]

Frames saved on the headset ("save frame for review") are in Pictures/PokerAssistant:
    adb pull /sdcard/Pictures/PokerAssistant frames/
"""
import argparse
import ast
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageDraw

SIZE = 640
NUM_CLASSES = 52


def letterbox(img):
    w, h = img.size
    scale = min(SIZE / w, SIZE / h)
    nw, nh = round(w * scale), round(h * scale)
    canvas = Image.new("RGB", (SIZE, SIZE), (114, 114, 114))
    pad_x, pad_y = (SIZE - nw) // 2, (SIZE - nh) // 2
    canvas.paste(img.resize((nw, nh), Image.BILINEAR), (pad_x, pad_y))
    return canvas, scale, pad_x, pad_y


def iou(a, b):
    w = min(a[2], b[2]) - max(a[0], b[0])
    h = min(a[3], b[3]) - max(a[1], b[1])
    if w <= 0 or h <= 0:
        return 0.0
    inter = w * h
    area = lambda r: (r[2] - r[0]) * (r[3] - r[1])
    return inter / (area(a) + area(b) - inter)


def detect(session, img, conf_threshold, iou_threshold):
    boxed, scale, px, py = letterbox(img)
    x = np.asarray(boxed, dtype=np.float32).transpose(2, 0, 1)[None] / 255.0
    out = session.run(None, {session.get_inputs()[0].name: x})[0][0]  # (4 + 52, anchors)
    scores = out[4:4 + NUM_CLASSES]
    cls, conf = scores.argmax(0), scores.max(0)
    keep = np.where(conf >= conf_threshold)[0]
    dets = []
    for i in keep[np.argsort(-conf[keep])]:
        cx, cy, w, h = out[:4, i]
        box = [(cx - w / 2 - px) / scale, (cy - h / 2 - py) / scale,
               (cx + w / 2 - px) / scale, (cy + h / 2 - py) / scale]
        c = int(cls[i])
        if all(d["cls"] != c or iou(d["box"], box) <= iou_threshold for d in dets):
            dets.append({"cls": c, "conf": float(conf[i]), "box": box})
    return dets


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("model")
    parser.add_argument("out_dir")
    parser.add_argument("images", nargs="+")
    parser.add_argument("--zoom", action="store_true", help="only the central half, like the app's zoom mode")
    parser.add_argument("--conf", type=float, default=0.5)
    parser.add_argument("--iou", type=float, default=0.5)
    args = parser.parse_args()

    session = ort.InferenceSession(args.model, providers=["CPUExecutionProvider"])
    names = ast.literal_eval(session.get_modelmeta().custom_metadata_map["names"])
    Path(args.out_dir).mkdir(parents=True, exist_ok=True)

    for path in args.images:
        img = Image.open(path).convert("RGB")
        ox = oy = 0
        view = img
        if args.zoom:
            ox, oy = img.width // 4, img.height // 4
            view = img.crop((ox, oy, img.width - ox, img.height - oy))
        dets = detect(session, view, args.conf, args.iou)
        best = {}
        for d in dets:
            name = names[d["cls"]]
            best[name] = max(best.get(name, 0.0), d["conf"])
        found = ", ".join(f"{k} {v:.2f}" for k, v in sorted(best.items(), key=lambda kv: -kv[1]))
        print(f"{Path(path).name}: {found or 'no cards'}")

        draw = ImageDraw.Draw(img)
        if args.zoom:
            draw.rectangle([ox, oy, img.width - ox, img.height - oy], outline=(255, 255, 255), width=2)
        for d in dets:
            l, t, r, b = d["box"]
            box = [l + ox, t + oy, r + ox, b + oy]
            draw.rectangle(box, outline=(255, 220, 0), width=3)
            draw.text((box[0], max(0, box[1] - 12)), f"{names[d['cls']]} {d['conf']:.2f}", fill=(255, 220, 0))
        img.save(Path(args.out_dir) / (Path(path).stem + "_detected.png"))


if __name__ == "__main__":
    main()
