package com.questclaude.vision.poker

/**
 * Pure-Kotlin pre- and post-processing for the YOLOv8 playing-card model, kept free of
 * Android classes so it can be unit-tested on the JVM.
 *
 * The model looks at a 640x640 RGB image and reports boxes around card corners (the rank +
 * suit index), each labelled with one of 52 card classes. Most cards show two corners, so the
 * same card is usually found twice; [bestPerCard] merges those.
 */
object CardModel {
    const val INPUT_SIZE = 640
    const val NUM_CLASSES = 52
    private const val PAD_VALUE = 114f / 255f

    /** A frame resized into the model's square input, plus how to map boxes back. */
    class Letterboxed(val chw: FloatArray, val scale: Float, val padX: Float, val padY: Float)

    /** One detected card corner, in the original image's pixel coordinates. */
    data class Detection(
        val card: Int,
        val confidence: Float,
        val left: Float,
        val top: Float,
        val right: Float,
        val bottom: Float,
    ) {
        val centerX: Float get() = (left + right) / 2
        val area: Float get() = (right - left) * (bottom - top)
    }

    /**
     * Maps the model's class indices to cards, from the "names" metadata Ultralytics stores in
     * the ONNX file, e.g. "{0: '10C', 1: '10D', ...}".
     */
    fun parseClassNames(metadata: String): IntArray {
        val entries = Regex("""(\d+)\s*:\s*'([^']+)'""").findAll(metadata)
            .associate { it.groupValues[1].toInt() to it.groupValues[2] }
        require(entries.size == NUM_CLASSES) { "Expected $NUM_CLASSES classes, found ${entries.size}" }
        return IntArray(NUM_CLASSES) { index ->
            val label = entries[index] ?: error("Missing class $index")
            Cards.parse(label) ?: error("Unknown card label '$label'")
        }
    }

    /**
     * Letterboxes ARGB pixels into the model input: keeps the aspect ratio (bilinear resize),
     * pads with grey, scales to 0..1 and lays the data out as planar RGB (CHW).
     */
    fun preprocess(argb: IntArray, width: Int, height: Int): Letterboxed {
        val scale = minOf(INPUT_SIZE.toFloat() / width, INPUT_SIZE.toFloat() / height)
        val newW = Math.round(width * scale)
        val newH = Math.round(height * scale)
        val padX = (INPUT_SIZE - newW) / 2
        val padY = (INPUT_SIZE - newH) / 2
        val plane = INPUT_SIZE * INPUT_SIZE
        val chw = FloatArray(3 * plane) { PAD_VALUE }

        for (y in 0 until newH) {
            val srcY = ((y + 0.5f) / scale - 0.5f).coerceIn(0f, (height - 1).toFloat())
            val y0 = srcY.toInt()
            val y1 = minOf(y0 + 1, height - 1)
            val fy = srcY - y0
            for (x in 0 until newW) {
                val srcX = ((x + 0.5f) / scale - 0.5f).coerceIn(0f, (width - 1).toFloat())
                val x0 = srcX.toInt()
                val x1 = minOf(x0 + 1, width - 1)
                val fx = srcX - x0
                val p00 = argb[y0 * width + x0]
                val p01 = argb[y0 * width + x1]
                val p10 = argb[y1 * width + x0]
                val p11 = argb[y1 * width + x1]
                val index = (y + padY) * INPUT_SIZE + (x + padX)
                for (channel in 0 until 3) {
                    val shift = 16 - 8 * channel // R, G, B
                    val top = ((p00 shr shift) and 0xFF) * (1 - fx) + ((p01 shr shift) and 0xFF) * fx
                    val bottom = ((p10 shr shift) and 0xFF) * (1 - fx) + ((p11 shr shift) and 0xFF) * fx
                    chw[channel * plane + index] = (top * (1 - fy) + bottom * fy) / 255f
                }
            }
        }
        return Letterboxed(chw, scale, padX.toFloat(), padY.toFloat())
    }

    /**
     * Decodes the raw model output, shaped [1, 4 + 52, anchors] and flattened row-major:
     * per anchor a box (centre x, centre y, width, height) and one score per class.
     * Keeps confident boxes and removes overlapping duplicates of the same card (NMS).
     */
    fun decode(
        output: FloatArray,
        classToCard: IntArray,
        input: Letterboxed,
        confidenceThreshold: Float = 0.5f,
        iouThreshold: Float = 0.5f,
    ): List<Detection> {
        val anchors = output.size / (4 + NUM_CLASSES)
        val candidates = ArrayList<Detection>()
        for (a in 0 until anchors) {
            var bestClass = 0
            var bestScore = output[4 * anchors + a]
            for (c in 1 until NUM_CLASSES) {
                val score = output[(4 + c) * anchors + a]
                if (score > bestScore) {
                    bestScore = score
                    bestClass = c
                }
            }
            if (bestScore < confidenceThreshold) continue
            val cx = output[a]
            val cy = output[anchors + a]
            val w = output[2 * anchors + a]
            val h = output[3 * anchors + a]
            candidates += Detection(
                card = classToCard[bestClass],
                confidence = bestScore,
                left = (cx - w / 2 - input.padX) / input.scale,
                top = (cy - h / 2 - input.padY) / input.scale,
                right = (cx + w / 2 - input.padX) / input.scale,
                bottom = (cy + h / 2 - input.padY) / input.scale,
            )
        }
        candidates.sortByDescending { it.confidence }
        val kept = ArrayList<Detection>()
        for (candidate in candidates) {
            if (kept.none { it.card == candidate.card && iou(it, candidate) > iouThreshold }) kept += candidate
        }
        return kept
    }

    /** One entry per card: its most confident corner. */
    fun bestPerCard(detections: List<Detection>): List<Detection> =
        detections.groupBy { it.card }.values.map { corners -> corners.maxBy { it.confidence } }

    /**
     * Combines several frames of the same view: a card counts only when it was seen in at least
     * [minFrames] of them, which filters out one-frame misreads.
     */
    fun vote(frames: List<List<Detection>>, minFrames: Int): List<Detection> {
        val perFrame = frames.map { bestPerCard(it) }
        return perFrame.flatten()
            .groupBy { it.card }
            .filterValues { it.size >= minFrames }
            .values.map { sightings -> sightings.maxBy { it.confidence } }
            .sortedByDescending { it.confidence }
    }

    private fun iou(a: Detection, b: Detection): Float {
        val w = minOf(a.right, b.right) - maxOf(a.left, b.left)
        val h = minOf(a.bottom, b.bottom) - maxOf(a.top, b.top)
        if (w <= 0f || h <= 0f) return 0f
        val inter = w * h
        return inter / (a.area + b.area - inter)
    }
}
