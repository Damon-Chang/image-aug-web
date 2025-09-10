# Image Augmentation Tool

A flexible, configurable Python tool for image data augmentation. Supports single image, multiple images, or folder input. Outputs organized by augmentation type. Includes AIGC image generation base class framework.

---

## 1. Installation

Install dependencies:

```bash
pip install -r requirements.txt
```

> ✅ Requires Python 3.8+  
> ✅ Supports Windows / Linux / macOS

---

## 2. Quick Start

### Recommended: Use Config File

```bash
./run_augmentation.sh
```

This runs the tool using `config.yaml` — the most maintainable and reproducible method.

### Manual Command Line (for quick tests)

```bash
python image_augmentation.py \
    -i ./examples/input \
    -o ./examples/output \
    -a hflip rotate noise \
    --rotate_angle -45 45 \
    --crop_ratio 0.7 \
    --overwrite
```

---

## 3. Configuration via `config.yaml`

All augmentation parameters are configurable via `config.yaml`. Command-line arguments override config values.

Example `config.yaml`:

```yaml
input:
  path: "./examples/input"

output:
  directory: "./examples/output"
  overwrite: true

augmentations:
  enabled:
    - rotate
    - crop
    - noise
    - brightness

  params:
    rotate:
      angle_range: [-90, 90]
    crop:
      ratio: 0.6
    noise:
      mode: "salt"
    brightness:
      factor_range: [0.7, 1.8]
```

Run with config:

```bash
python image_augmentation.py -c config.yaml
```

---

## 4. Supported Augmentations & Configurable Parameters

| Augmentation     | Config Key       | Parameters (with defaults)                          | Description                                  |
|------------------|------------------|-----------------------------------------------------|----------------------------------------------|
| Random Crop      | `crop`           | `ratio: 0.8`                                        | Crop center region and resize back.          |
| Add Noise        | `noise`          | `mode: gaussian` (salt/pepper/s&p)                  | Add sensor-like noise.                       |
| Horizontal Flip  | `hflip`          | (no parameters)                                     | Mirror image left-right.                     |
| Vertical Flip    | `vflip`          | (no parameters)                                     | Mirror image top-bottom.                     |
| Rotate           | `rotate`         | `angle_range: [-30, 30]`                            | Random rotation within range.                |
| Scale            | `scale`          | `range: [0.8, 1.2]`                                 | Random zoom in/out, pad or crop to original. |
| Brightness       | `brightness`     | `factor_range: [0.5, 1.5]`                          | Adjust brightness multiplicatively.          |
| Contrast         | `contrast`       | `factor_range: [0.5, 1.5]`                          | Adjust contrast.                             |
| Gaussian Blur    | `blur`           | `kernel_range: [3, 7]` (odd integers)               | Apply random Gaussian blur.                  |
| Elastic Transform| `elastic`        | `alpha: 34.0`, `sigma: 4.0`                         | Simulate non-rigid deformation.              |
| Color Jitter     | `color_jitter`   | `brightness: 0.2`, `contrast: 0.2`, `saturation: 0.2`| Randomly adjust color properties.            |
| Random Erasing   | `erase`          | `p: 0.5`, `sl: 0.02`, `sh: 0.4`, `r1: 0.3`          | Randomly erase a patch with noise.           |
| Motion Blur      | `motion_blur`    | `size: 15`                                          | Simulate linear motion blur.                 |

> 💡 All parameters are optional — defaults are used if not specified.

---

## 5. Output Structure

After running:

```
output/
├── rotate/
│   └── rotate_image1.jpg
├── crop/
│   └── crop_image1.jpg
└── noise/
    └── noise_image1.jpg
```

> - Each augmentation gets its own subfolder.
> - Filename format: `{aug_name}_{original_name}`

---

## 6. AIGC Image Generator Base Class

Included abstract base class `AIGCImageGenerator` for integrating AI image models (e.g., Stable Diffusion, DALL·E).

```python
class AIGCImageGenerator(ABC):
    def __init__(self, model_name=None, device='cpu', **kwargs)
    @abstractmethod
    def _load_model(self)
    @abstractmethod
    def generate(self, prompt, num_images=1, **kwargs)
    def save_images(self, images, output_dir, prefix="aigc")
```

> Extend this class to implement your own AIGC generator.

---

## 7. Project Structure

```
.
├── image_augmentation.py
├── config.yaml
├── requirements.txt
├── run_augmentation.sh
├── README.md
└── examples/
    ├── input/
    └── output/
```

---

## 8. Customization

### Add New Augmentation

1. Define function with parameters:

```python
def my_aug(img, param1=1.0):
    # ... processing
    return img
```

2. Register in `AUGMENTATIONS` dict:

```python
AUGMENTATIONS['my_aug'] = my_aug
```

3. Add argparse argument and config support in `main()`.

4. Add call branch in `process_images()`.

---

## 9. License

MIT License — Free for personal, academic, and commercial use.

---

## 10. Support

For bugs or feature requests, open an issue.

---
```

---

## ✅ 同步更新：`run_augmentation.sh` 中的提示语（更专业）

```bash
echo "Augmentation completed. Output saved to: $(grep -A1 'output:' $CONFIG_FILE | grep 'directory' | awk '{print $2}' | tr -d '\r')"
```

→ 改为：

```bash
OUTPUT_DIR=$(grep -A1 "output:" "$CONFIG_FILE" | grep "directory:" | awk '{print $2}' | tr -d '\r' | tr -d '"')
echo "Augmentation completed. Output saved to: $OUTPUT_DIR"
```

> 更健壮，支持带引号的路径。


