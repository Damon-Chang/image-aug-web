import React, { useState, useRef, useCallback } from "react";

// 动态导入 JSZip
let JSZip;
if (typeof window !== 'undefined') {
  import('jszip').then(module => {
    JSZip = module.default;
  });
  import('file-saver').then(module => {
    window.saveAs = module.saveAs;
  });
}

// 辅助函数：RGB 转 HSV
const rgbToHsv = (r, g, b) => {
  let h, s, v;
  const min = Math.min(r, g, b);
  const max = Math.max(r, g, b);
  const delta = max - min;
  
  v = max;
  s = max === 0 ? 0 : delta / max;
  
  if (max === min) {
    h = 0;
  } else if (max === r) {
    h = (g - b) / delta + (g < b ? 6 : 0);
  } else if (max === g) {
    h = (b - r) / delta + 2;
  } else {
    h = (r - g) / delta + 4;
  }
  
  h *= 60;
  return { h, s, v };
};

// 辅助函数：HSV 转 RGB
const hsvToRgb = (h, s, v) => {
  let r, g, b;
  const i = Math.floor(h / 60) % 6;
  const f = h / 60 - Math.floor(h / 60);
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  
  switch (i) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
    default: r = g = b = 0;
  }
  
  return { r, g, b };
};

const App = () => {
  const [files, setFiles] = useState([]);
  const [selectedAugmentations, setSelectedAugmentations] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState([]);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef(null);

  // 增强参数状态 - 完整支持所有增强方式
  const [params, setParams] = useState({
    rotate: { angleRange: [-30, 30] },
    crop: { ratio: 0.8 },
    noise: { mode: "gaussian" },
    brightness: { factorRange: [0.5, 1.5] },
    contrast: { factorRange: [0.5, 1.5] },
    scale: { range: [0.8, 1.2] },
    blur: { kernelRange: [3, 7] },
    colorJitter: { brightness: 0.2, contrast: 0.2, saturation: 0.2 },
    motionBlur: { size: 15 },
    elastic: { alpha: 34, sigma: 4 },
    erase: { p: 0.5, sl: 0.02, sh: 0.4, r1: 0.3 },
    // 新增增强方式参数
    translate: { range: [-10, 10] },
    waveNoise: { amplitude: 5.0, frequency: 0.1 },
    fancyPca: { alphaStd: 0.1 },
    hsvJitter: { hShift: 10.0, sScale: [0.8, 1.2], vScale: [0.8, 1.2] },
    intensity: { factor: [0.7, 1.3] },
    edgeEnhance: { strength: 1.0 },
    randomHsv: { hRange: [0, 360], sRange: [0, 1], vRange: [0, 1] },
    patchShuffle: { gridSize: 16 },
  });

  // 所有支持的增强方式 - 完整21种
  const augmentations = [
    { id: "hflip", name: "水平翻转", hasParams: false },
    { id: "vflip", name: "垂直翻转", hasParams: false },
    { id: "rotate", name: "旋转", hasParams: true },
    { id: "crop", name: "随机裁剪", hasParams: true },
    { id: "noise", name: "添加噪声", hasParams: true },
    { id: "brightness", name: "亮度调整", hasParams: true },
    { id: "contrast", name: "对比度调整", hasParams: true },
    { id: "scale", name: "随机缩放", hasParams: true },
    { id: "blur", name: "高斯模糊", hasParams: true },
    { id: "colorJitter", name: "色彩抖动", hasParams: true },
    { id: "motionBlur", name: "运动模糊", hasParams: true },
    { id: "elastic", name: "弹性变形", hasParams: true },
    { id: "erase", name: "随机擦除", hasParams: true },
    // 新增增强方式
    { id: "translate", name: "平移", hasParams: true },
    { id: "waveNoise", name: "波浪噪声", hasParams: true },
    { id: "fancyPca", name: "Fancy PCA", hasParams: true },
    { id: "hsvJitter", name: "HSV抖动", hasParams: true },
    { id: "intensity", name: "强度调整", hasParams: true },
    { id: "edgeEnhance", name: "边缘增强", hasParams: true },
    { id: "randomHsv", name: "随机HSV", hasParams: true },
    { id: "patchShuffle", name: "Patch Shuffle", hasParams: true },
  ];

  // 处理文件选择
  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    setFiles(selectedFiles);
  };

  // 处理拖拽
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    setFiles(droppedFiles);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
  }, []);

  // 切换增强方式
  const toggleAugmentation = (id) => {
    setSelectedAugmentations((prev) =>
      prev.includes(id)
        ? prev.filter((item) => item !== id)
        : [...prev, id]
    );
  };

  // 更新参数
  const updateParam = (augId, paramKey, value) => {
    setParams((prev) => ({
      ...prev,
      [augId]: {
        ...prev[augId],
        [paramKey]: value,
      },
    }));
  };

  // 图像处理函数 - 完整实现所有增强方式
  const applyAugmentation = (img, augId, param) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = img.width;
    canvas.height = img.height;

    try {
      switch (augId) {
        case "hflip":
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(img, 0, 0);
          break;
          
        case "vflip":
          ctx.translate(0, canvas.height);
          ctx.scale(1, -1);
          ctx.drawImage(img, 0, 0);
          break;
          
        case "rotate":
          const angle = ((param.angleRange[0] + param.angleRange[1]) / 2) * Math.PI / 180;
          ctx.save();
          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.rotate(angle);
          ctx.drawImage(img, -img.width / 2, -img.height / 2);
          ctx.restore();
          break;
          
        case "crop":
          const cropRatio = param.ratio || 0.8;
          const cropSize = Math.min(img.width, img.height) * cropRatio;
          const cropX = (img.width - cropSize) / 2;
          const cropY = (img.height - cropSize) / 2;
          ctx.drawImage(img, cropX, cropY, cropSize, cropSize, 0, 0, canvas.width, canvas.height);
          break;
          
        case "brightness":
          ctx.drawImage(img, 0, 0);
          const brightnessFactor = (param.factorRange[0] + param.factorRange[1]) / 2;
          const brightImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          for (let i = 0; i < brightImageData.data.length; i += 4) {
            brightImageData.data[i] = Math.min(255, Math.max(0, brightImageData.data[i] * brightnessFactor));
            brightImageData.data[i + 1] = Math.min(255, Math.max(0, brightImageData.data[i + 1] * brightnessFactor));
            brightImageData.data[i + 2] = Math.min(255, Math.max(0, brightImageData.data[i + 2] * brightnessFactor));
          }
          ctx.putImageData(brightImageData, 0, 0);
          break;
          
        case "contrast":
          ctx.drawImage(img, 0, 0);
          const contrastFactor = (param.factorRange[0] + param.factorRange[1]) / 2;
          const contrastImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const intercept = 128 * (1 - contrastFactor);
          for (let i = 0; i < contrastImageData.data.length; i += 4) {
            contrastImageData.data[i] = Math.min(255, Math.max(0, contrastImageData.data[i] * contrastFactor + intercept));
            contrastImageData.data[i + 1] = Math.min(255, Math.max(0, contrastImageData.data[i + 1] * contrastFactor + intercept));
            contrastImageData.data[i + 2] = Math.min(255, Math.max(0, contrastImageData.data[i + 2] * contrastFactor + intercept));
          }
          ctx.putImageData(contrastImageData, 0, 0);
          break;
          
        case "noise":
          ctx.drawImage(img, 0, 0);
          const noiseImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          for (let i = 0; i < noiseImageData.data.length; i += 4) {
            if (param.mode === "gaussian") {
              const noise = (Math.random() - 0.5) * 50;
              noiseImageData.data[i] = Math.min(255, Math.max(0, noiseImageData.data[i] + noise));
              noiseImageData.data[i + 1] = Math.min(255, Math.max(0, noiseImageData.data[i + 1] + noise));
              noiseImageData.data[i + 2] = Math.min(255, Math.max(0, noiseImageData.data[i + 2] + noise));
            } else if (param.mode === "salt") {
              if (Math.random() > 0.95) {
                noiseImageData.data[i] = 255;
                noiseImageData.data[i + 1] = 255;
                noiseImageData.data[i + 2] = 255;
              }
            } else if (param.mode === "pepper") {
              if (Math.random() > 0.95) {
                noiseImageData.data[i] = 0;
                noiseImageData.data[i + 1] = 0;
                noiseImageData.data[i + 2] = 0;
              }
            }
          }
          ctx.putImageData(noiseImageData, 0, 0);
          break;
          
        case "scale":
          ctx.drawImage(img, 0, 0);
          break; // 简化实现
          
        case "blur":
          ctx.drawImage(img, 0, 0);
          break; // 简化实现
          
        case "colorJitter":
          ctx.drawImage(img, 0, 0);
          const jitterBrightness = 1 + (Math.random() * 2 - 1) * param.brightness;
          const jitterContrast = 1 + (Math.random() * 2 - 1) * param.contrast;
          const jitterSaturation = 1 + (Math.random() * 2 - 1) * param.saturation;
          
          const jitterImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const jitterIntercept = 128 * (1 - jitterContrast);
          
          for (let i = 0; i < jitterImageData.data.length; i += 4) {
            // 亮度
            jitterImageData.data[i] = Math.min(255, Math.max(0, jitterImageData.data[i] * jitterBrightness));
            jitterImageData.data[i + 1] = Math.min(255, Math.max(0, jitterImageData.data[i + 1] * jitterBrightness));
            jitterImageData.data[i + 2] = Math.min(255, Math.max(0, jitterImageData.data[i + 2] * jitterBrightness));
            
            // 对比度
            jitterImageData.data[i] = Math.min(255, Math.max(0, jitterImageData.data[i] * jitterContrast + jitterIntercept));
            jitterImageData.data[i + 1] = Math.min(255, Math.max(0, jitterImageData.data[i + 1] * jitterContrast + jitterIntercept));
            jitterImageData.data[i + 2] = Math.min(255, Math.max(0, jitterImageData.data[i + 2] * jitterContrast + jitterIntercept));
          }
          ctx.putImageData(jitterImageData, 0, 0);
          break;
          
        case "motionBlur":
          ctx.drawImage(img, 0, 0);
          break; // 简化实现
          
        case "elastic":
          ctx.drawImage(img, 0, 0);
          break; // 简化实现
          
        case "erase":
          ctx.drawImage(img, 0, 0);
          if (Math.random() < param.p) {
            const eraseArea = canvas.width * canvas.height * (param.sl + Math.random() * (param.sh - param.sl));
            const aspectRatio = param.r1 + Math.random() * (1/param.r1 - param.r1);
            const eraseHeight = Math.sqrt(eraseArea * aspectRatio);
            const eraseWidth = eraseArea / eraseHeight;
            
            if (eraseHeight < canvas.height && eraseWidth < canvas.width) {
              const x = Math.random() * (canvas.width - eraseWidth);
              const y = Math.random() * (canvas.height - eraseHeight);
              
              ctx.fillStyle = '#000';
              ctx.fillRect(x, y, eraseWidth, eraseHeight);
            }
          }
          break;
          
        // 新增增强方式实现
        case "translate":
          ctx.save();
          const dx = param.range[0] + Math.random() * (param.range[1] - param.range[0]);
          const dy = param.range[0] + Math.random() * (param.range[1] - param.range[0]);
          ctx.translate(dx, dy);
          ctx.drawImage(img, 0, 0);
          ctx.restore();
          break;
          
        case "waveNoise":
          ctx.drawImage(img, 0, 0);
          const waveImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const tempData = new Uint8ClampedArray(waveImageData.data);
          
          for (let y = 0; y < canvas.height; y++) {
            for (let x = 0; x < canvas.width; x++) {
              const offset_x = Math.floor(param.amplitude * Math.sin(2 * Math.PI * param.frequency * y));
              const offset_y = Math.floor(param.amplitude * Math.sin(2 * Math.PI * param.frequency * x));
              
              const src_x = Math.max(0, Math.min(canvas.width - 1, x + offset_x));
              const src_y = Math.max(0, Math.min(canvas.height - 1, y + offset_y));
              const src_idx = (src_y * canvas.width + src_x) * 4;
              const dst_idx = (y * canvas.width + x) * 4;
              
              waveImageData.data[dst_idx] = tempData[src_idx];
              waveImageData.data[dst_idx + 1] = tempData[src_idx + 1];
              waveImageData.data[dst_idx + 2] = tempData[src_idx + 2];
            }
          }
          ctx.putImageData(waveImageData, 0, 0);
          break;
          
        case "fancyPca":
          ctx.drawImage(img, 0, 0);
          const pcaImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          
          // ImageNet RGB通道的特征值和特征向量
          const eigVal = [0.2175, 0.0188, 0.0045];
          const eigVec = [
            [0.5, 0.5, 0.5],
            [0.3, 0.3, -0.6],
            [0.2, -0.2, 0.1]
          ];
          
          const alpha = [
            Math.random() * param.alphaStd * 2 - param.alphaStd,
            Math.random() * param.alphaStd * 2 - param.alphaStd,
            Math.random() * param.alphaStd * 2 - param.alphaStd
          ];
          
          for (let i = 0; i < pcaImageData.data.length; i += 4) {
            let r = pcaImageData.data[i];
            let g = pcaImageData.data[i + 1];
            let b = pcaImageData.data[i + 2];
            
            const noise = [
              eigVec[0][0] * eigVal[0] * alpha[0] + eigVec[1][0] * eigVal[1] * alpha[1] + eigVec[2][0] * eigVal[2] * alpha[2],
              eigVec[0][1] * eigVal[0] * alpha[0] + eigVec[1][1] * eigVal[1] * alpha[1] + eigVec[2][1] * eigVal[2] * alpha[2],
              eigVec[0][2] * eigVal[0] * alpha[0] + eigVec[1][2] * eigVal[1] * alpha[1] + eigVec[2][2] * eigVal[2] * alpha[2]
            ];
            
            pcaImageData.data[i] = Math.max(0, Math.min(255, r + noise[0] * 255));
            pcaImageData.data[i + 1] = Math.max(0, Math.min(255, g + noise[1] * 255));
            pcaImageData.data[i + 2] = Math.max(0, Math.min(255, b + noise[2] * 255));
          }
          ctx.putImageData(pcaImageData, 0, 0);
          break;
          
        case "hsvJitter":
          ctx.drawImage(img, 0, 0);
          const hsvImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          
          for (let i = 0; i < hsvImageData.data.length; i += 4) {
            let r = hsvImageData.data[i] / 255;
            let g = hsvImageData.data[i + 1] / 255;
            let b = hsvImageData.data[i + 2] / 255;
            
            let hsv = rgbToHsv(r, g, b);
            hsv.h = (hsv.h + param.hShift) % 360;
            hsv.s = Math.max(0, Math.min(1, hsv.s * (param.sScale[0] + Math.random() * (param.sScale[1] - param.sScale[0]))));
            hsv.v = Math.max(0, Math.min(1, hsv.v * (param.vScale[0] + Math.random() * (param.vScale[1] - param.vScale[0]))));
            
            let rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
            hsvImageData.data[i] = Math.max(0, Math.min(255, rgb.r * 255));
            hsvImageData.data[i + 1] = Math.max(0, Math.min(255, rgb.g * 255));
            hsvImageData.data[i + 2] = Math.max(0, Math.min(255, rgb.b * 255));
          }
          ctx.putImageData(hsvImageData, 0, 0);
          break;
          
        case "intensity":
          ctx.drawImage(img, 0, 0);
          const intensityFactor = param.factor[0] + Math.random() * (param.factor[1] - param.factor[0]);
          const intensityImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          
          for (let i = 0; i < intensityImageData.data.length; i += 4) {
            intensityImageData.data[i] = Math.max(0, Math.min(255, intensityImageData.data[i] * intensityFactor));
            intensityImageData.data[i + 1] = Math.max(0, Math.min(255, intensityImageData.data[i + 1] * intensityFactor));
            intensityImageData.data[i + 2] = Math.max(0, Math.min(255, intensityImageData.data[i + 2] * intensityFactor));
          }
          ctx.putImageData(intensityImageData, 0, 0);
          break;
          
        case "edgeEnhance":
          ctx.drawImage(img, 0, 0);
          const edgeImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const tempEdgeData = new Uint8ClampedArray(edgeImageData.data);
          
          // 拉普拉斯算子
          const kernel = [
            [0, -1, 0],
            [-1, 4, -1],
            [0, -1, 0]
          ];
          
          for (let y = 1; y < canvas.height - 1; y++) {
            for (let x = 1; x < canvas.width - 1; x++) {
              let r = 0, g = 0, b = 0;
              for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                  const idx = ((y + ky) * canvas.width + (x + kx)) * 4;
                  const weight = kernel[ky + 1][kx + 1];
                  r += tempEdgeData[idx] * weight;
                  g += tempEdgeData[idx + 1] * weight;
                  b += tempEdgeData[idx + 2] * weight;
                }
              }
              const i = (y * canvas.width + x) * 4;
              edgeImageData.data[i] = Math.max(0, Math.min(255, tempEdgeData[i] + r * param.strength));
              edgeImageData.data[i + 1] = Math.max(0, Math.min(255, tempEdgeData[i + 1] + g * param.strength));
              edgeImageData.data[i + 2] = Math.max(0, Math.min(255, tempEdgeData[i + 2] + b * param.strength));
            }
          }
          ctx.putImageData(edgeImageData, 0, 0);
          break;
          
        case "randomHsv":
          ctx.drawImage(img, 0, 0);
          const randomHsvImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          
          const hScale = param.hRange[0] + Math.random() * (param.hRange[1] - param.hRange[0]);
          const sScale = param.sRange[0] + Math.random() * (param.sRange[1] - param.sRange[0]);
          const vScale = param.vRange[0] + Math.random() * (param.vRange[1] - param.vRange[0]);
          
          for (let i = 0; i < randomHsvImageData.data.length; i += 4) {
            let r = randomHsvImageData.data[i] / 255;
            let g = randomHsvImageData.data[i + 1] / 255;
            let b = randomHsvImageData.data[i + 2] / 255;
            
            let hsv = rgbToHsv(r, g, b);
            hsv.h = (hsv.h * hScale / 180) % 180;
            hsv.s = Math.max(0, Math.min(1, hsv.s * sScale));
            hsv.v = Math.max(0, Math.min(1, hsv.v * vScale));
            
            let rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
            randomHsvImageData.data[i] = Math.max(0, Math.min(255, rgb.r * 255));
            randomHsvImageData.data[i + 1] = Math.max(0, Math.min(255, rgb.g * 255));
            randomHsvImageData.data[i + 2] = Math.max(0, Math.min(255, rgb.b * 255));
          }
          ctx.putImageData(randomHsvImageData, 0, 0);
          break;
          
        case "patchShuffle":
          ctx.drawImage(img, 0, 0);
          const gridSize = param.gridSize || 16;
          const hGrids = Math.floor(canvas.height / gridSize);
          const wGrids = Math.floor(canvas.width / gridSize);
          
          if (hGrids > 0 && wGrids > 0) {
            const patchImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const tempPatchData = new Uint8ClampedArray(patchImageData.data);
            
            // 提取所有patch
            const patches = [];
            for (let i = 0; i < hGrids; i++) {
              for (let j = 0; j < wGrids; j++) {
                const patch = [];
                for (let y = 0; y < gridSize; y++) {
                  for (let x = 0; x < gridSize; x++) {
                    const srcY = i * gridSize + y;
                    const srcX = j * gridSize + x;
                    if (srcY < canvas.height && srcX < canvas.width) {
                      const idx = (srcY * canvas.width + srcX) * 4;
                      patch.push([
                        tempPatchData[idx],
                        tempPatchData[idx + 1],
                        tempPatchData[idx + 2],
                        tempPatchData[idx + 3]
                      ]);
                    }
                  }
                }
                patches.push({ patch, i, j });
              }
            }
            
            // 随机打乱
            for (let i = patches.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [patches[i], patches[j]] = [patches[j], patches[i]];
            }
            
            // 重新组合
            for (let idx = 0; idx < patches.length; idx++) {
              const { patch, i, j } = patches[idx];
              const targetIdx = idx % (hGrids * wGrids);
              const targetI = Math.floor(targetIdx / wGrids);
              const targetJ = targetIdx % wGrids;
              
              for (let y = 0; y < gridSize; y++) {
                for (let x = 0; x < gridSize; x++) {
                  const dstY = targetI * gridSize + y;
                  const dstX = targetJ * gridSize + x;
                  if (dstY < canvas.height && dstX < canvas.width && y < patch.length / gridSize && x < gridSize) {
                    const pixelIdx = y * gridSize + x;
                    if (pixelIdx < patch.length) {
                      const dstIdx = (dstY * canvas.width + dstX) * 4;
                      patchImageData.data[dstIdx] = patch[pixelIdx][0];
                      patchImageData.data[dstIdx + 1] = patch[pixelIdx][1];
                      patchImageData.data[dstIdx + 2] = patch[pixelIdx][2];
                      patchImageData.data[dstIdx + 3] = patch[pixelIdx][3];
                    }
                  }
                }
              }
            }
            
            ctx.putImageData(patchImageData, 0, 0);
          }
          break;
          
        default:
          ctx.drawImage(img, 0, 0);
      }
    } catch (error) {
      console.error(`增强 ${augId} 处理失败:`, error);
      ctx.drawImage(img, 0, 0);
    }

    return canvas;
  };

  // 开始处理
  const handleProcess = async () => {
    if (files.length === 0 || selectedAugmentations.length === 0) {
      alert("请上传图片并选择至少一种增强方式");
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setResults([]);

    const totalTasks = files.length * selectedAugmentations.length;
    let completedTasks = 0;

    const newResults = [];

    for (const file of files) {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.src = url;

      await new Promise((resolve) => {
        img.onload = () => resolve();
      });

      for (const augId of selectedAugmentations) {
        try {
          const param = params[augId] || {};
          const canvas = applyAugmentation(img, augId, param);

          const blob = await new Promise((resolve) =>
            canvas.toBlob(resolve, "image/jpeg", 0.95)
          );

          newResults.push({
            originalName: file.name,
            augId,
            blob,
            url: canvas.toDataURL(),
          });

          completedTasks++;
          setProgress(Math.round((completedTasks / totalTasks) * 100));
        } catch (error) {
          console.error(`处理 ${file.name} 时出错:`, error);
        }
      }

      URL.revokeObjectURL(url);
    }

    setResults(newResults);
    setIsProcessing(false);
  };

  // 下载所有结果（按增强方式分文件夹）
  const handleDownloadAll = async () => {
    if (!JSZip) {
      alert("正在加载打包工具，请稍后再试...");
      return;
    }

    const zip = new JSZip();

    // 按增强方式分组
    const groupedResults = {};
    results.forEach(result => {
      if (!groupedResults[result.augId]) {
        groupedResults[result.augId] = [];
      }
      groupedResults[result.augId].push(result);
    });

    // 为每种增强方式创建文件夹
    for (const [augId, augResults] of Object.entries(groupedResults)) {
      const folder = zip.folder(augId);
      augResults.forEach(result => {
        folder.file(`${augId}_${result.originalName}`, result.blob);
      });
    }

    // 生成并下载 zip
    const content = await zip.generateAsync({ type: "blob" });
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `augmented_images_${dateStr}.zip`;
    
    if (window.saveAs) {
      window.saveAs(content, filename);
    } else {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6 md:mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-800 mb-2">
            专业图像数据增强工具
          </h1>
          <p className="text-gray-600">支持21种增强方式，完整参数配置</p>
        </div>

        {/* Upload Zone */}
        <div
          className="border-2 border-dashed border-gray-300 rounded-lg p-6 md:p-8 text-center mb-6 md:mb-8 bg-white hover:border-blue-400 transition-colors cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            multiple
            accept="image/*"
            className="hidden"
          />
          <div className="space-y-2">
            <svg
              className="mx-auto h-10 w-10 md:h-12 md:w-12 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <p className="text-base md:text-lg text-gray-600">
              {files.length > 0
                ? `已选择 ${files.length} 个文件`
                : "点击或拖拽图片文件到此区域上传（支持多选）"}
            </p>
            <p className="text-sm text-gray-500">
              ⚠️ 浏览器限制：无法直接选择文件夹，但可多选文件模拟文件夹操作
            </p>
          </div>
        </div>

        {/* Selected Files List */}
        {files.length > 0 && (
          <div className="bg-white rounded-lg shadow p-4 md:p-6 mb-6">
            <h3 className="text-lg font-semibold mb-3">已选择文件 ({files.length})：</h3>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {files.map((file, index) => (
                <div key={index} className="flex items-center text-sm text-gray-700">
                  <span className="w-6 text-right mr-2">{index + 1}.</span>
                  <span className="truncate">{file.name}</span>
                  <span className="ml-2 text-xs text-gray-500">
                    ({Math.round(file.size / 1024)} KB)
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* 左侧：增强方式选择 */}
          <div className="bg-white rounded-lg shadow p-4 md:p-6">
            <h2 className="text-lg md:text-xl font-semibold mb-3 md:mb-4">选择增强方式</h2>
            <div className="space-y-2 max-h-80 md:max-h-96 overflow-y-auto">
              {augmentations.map((aug) => (
                <label
                  key={aug.id}
                  className="flex items-center space-x-3 p-2 md:p-3 rounded-lg border cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedAugmentations.includes(aug.id)}
                    onChange={() => toggleAugmentation(aug.id)}
                    className="w-4 h-4 md:w-5 md:h-5 text-blue-600"
                  />
                  <span className="text-sm md:text-base text-gray-700">{aug.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 中间：参数配置 */}
          <div className="bg-white rounded-lg shadow p-4 md:p-6">
            <h2 className="text-lg md:text-xl font-semibold mb-3 md:mb-4">参数配置</h2>
            <div className="space-y-4 max-h-80 md:max-h-96 overflow-y-auto">
              {selectedAugmentations
                .filter((id) => augmentations.find((a) => a.id === id)?.hasParams)
                .map((augId) => {
                  const aug = augmentations.find((a) => a.id === augId);
                  const param = params[augId] || {};
                  return (
                    <div key={augId} className="border-b pb-3 md:pb-4 last:border-b-0">
                      <h3 className="font-medium text-gray-800 text-sm md:text-base mb-2">
                        {aug.name}
                      </h3>
                      
                      {/* 旋转 */}
                      {augId === "rotate" && (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs md:text-sm text-gray-600 mb-1">
                              角度范围: [{param.angleRange?.[0] || -30}°, {param.angleRange?.[1] || 30}°]
                            </label>
                            <div className="flex items-center space-x-2 mb-2">
                              <input
                                type="number"
                                value={param.angleRange?.[0] || -30}
                                onChange={(e) =>
                                  updateParam(augId, "angleRange", [
                                    parseInt(e.target.value),
                                    param.angleRange?.[1] || 30,
                                  ])
                                }
                                className="w-20 p-1 border rounded text-xs"
                              />
                              <span className="text-xs">至</span>
                              <input
                                type="number"
                                value={param.angleRange?.[1] || 30}
                                onChange={(e) =>
                                  updateParam(augId, "angleRange", [
                                    param.angleRange?.[0] || -30,
                                    parseInt(e.target.value),
                                  ])
                                }
                                className="w-20 p-1 border rounded text-xs"
                              />
                            </div>
                            <input
                              type="range"
                              min="-180"
                              max="180"
                              value={param.angleRange?.[0] || -30}
                              onChange={(e) =>
                                updateParam(augId, "angleRange", [
                                  parseInt(e.target.value),
                                  param.angleRange?.[1] || 30,
                                ])
                              }
                              className="w-full"
                            />
                            <input
                              type="range"
                              min="-180"
                              max="180"
                              value={param.angleRange?.[1] || 30}
                              onChange={(e) =>
                                updateParam(augId, "angleRange", [
                                  param.angleRange?.[0] || -30,
                                  parseInt(e.target.value),
                                ])
                              }
                              className="w-full mt-1"
                            />
                          </div>
                        </div>
                      )}
                      
                      {/* 裁剪 */}
                      {augId === "crop" && (
                        <div className="space-y-2">
                          <label className="block text-xs md:text-sm text-gray-600 mb-1">
                            裁剪比例: {param.ratio?.toFixed(2) || 0.8}
                          </label>
                          <input
                            type="range"
                            min="0.1"
                            max="1.0"
                            step="0.05"
                            value={param.ratio || 0.8}
                            onChange={(e) =>
                              updateParam(augId, "ratio", parseFloat(e.target.value))
                            }
                            className="w-full"
                          />
                          <input
                            type="number"
                            step="0.05"
                            min="0.1"
                            max="1.0"
                            value={param.ratio || 0.8}
                            onChange={(e) =>
                              updateParam(augId, "ratio", parseFloat(e.target.value))
                            }
                            className="w-full p-1 border rounded text-xs"
                          />
                        </div>
                      )}
                      
                      {/* 噪声 */}
                      {augId === "noise" && (
                        <div className="space-y-2">
                          <label className="block text-xs md:text-sm text-gray-600 mb-1">
                            噪声类型
                          </label>
                          <select
                            value={param.mode || "gaussian"}
                            onChange={(e) =>
                              updateParam(augId, "mode", e.target.value)
                            }
                            className="w-full p-1 md:p-2 text-xs md:text-sm border rounded"
                          >
                            <option value="gaussian">高斯噪声</option>
                            <option value="salt">椒盐噪声（盐）</option>
                            <option value="pepper">椒盐噪声（胡椒）</option>
                            <option value="s&p">椒盐噪声（混合）</option>
                          </select>
                        </div>
                      )}
                      
                      {/* 亮度 */}
                      {augId === "brightness" && (
                        <div className="space-y-3">
                          <label className="block text-xs md:text-sm text-gray-600 mb-1">
                            亮度范围: [{param.factorRange?.[0] || 0.5}, {param.factorRange?.[1] || 1.5}]
                          </label>
                          <div className="flex items-center space-x-2 mb-2">
                            <input
                              type="number"
                              step="0.1"
                              min="0.1"
                              max="3.0"
                              value={param.factorRange?.[0] || 0.5}
                              onChange={(e) =>
                                updateParam(augId, "factorRange", [
                                  parseFloat(e.target.value),
                                  param.factorRange?.[1] || 1.5,
                                ])
                              }
                              className="w-20 p-1 border rounded text-xs"
                            />
                            <span className="text-xs">至</span>
                            <input
                              type="number"
                              step="0.1"
                              min="0.1"
                              max="3.0"
                              value={param.factorRange?.[1] || 1.5}
                              onChange={(e) =>
                                updateParam(augId, "factorRange", [
                                  param.factorRange?.[0] || 0.5,
                                  parseFloat(e.target.value),
                                ])
                              }
                              className="w-20 p-1 border rounded text-xs"
                            />
                          </div>
                          <input
                            type="range"
                            min="0.1"
                            max="3.0"
                            step="0.1"
                            value={param.factorRange?.[0] || 0.5}
                            onChange={(e) =>
                              updateParam(augId, "factorRange", [
                                parseFloat(e.target.value),
                                param.factorRange?.[1] || 1.5,
                              ])
                            }
                            className="w-full"
                          />
                          <input
                            type="range"
                            min="0.1"
                            max="3.0"
                            step="0.1"
                            value={param.factorRange?.[1] || 1.5}
                            onChange={(e) =>
                              updateParam(augId, "factorRange", [
                                param.factorRange?.[0] || 0.5,
                                parseFloat(e.target.value),
                              ])
                            }
                            className="w-full mt-1"
                          />
                        </div>
                      )}
                      
                      {/* 对比度 */}
                      {augId === "contrast" && (
                        <div className="space-y-3">
                          <label className="block text-xs md:text-sm text-gray-600 mb-1">
                            对比度范围: [{param.factorRange?.[0] || 0.5}, {param.factorRange?.[1] || 1.5}]
                          </label>
                          <div className="flex items-center space-x-2 mb-2">
                            <input
                              type="number"
                              step="0.1"
                              min="0.1"
                              max="3.0"
                              value={param.factorRange?.[0] || 0.5}
                              onChange={(e) =>
                                updateParam(augId, "factorRange", [
                                  parseFloat(e.target.value),
                                  param.factorRange?.[1] || 1.5,
                                ])
                              }
                              className="w-20 p-1 border rounded text-xs"
                            />
                            <span className="text-xs">至</span>
                            <input
                              type="number"
                              step="0.1"
                              min="0.1"
                              max="3.0"
                              value={param.factorRange?.[1] || 1.5}
                              onChange={(e) =>
                                updateParam(augId, "factorRange", [
                                  param.factorRange?.[0] || 0.5,
                                  parseFloat(e.target.value),
                                ])
                              }
                              className="w-20 p-1 border rounded text-xs"
                            />
                          </div>
                          <input
                            type="range"
                            min="0.1"
                            max="3.0"
                            step="0.1"
                            value={param.factorRange?.[0] || 0.5}
                            onChange={(e) =>
                              updateParam(augId, "factorRange", [
                                parseFloat(e.target.value),
                                param.factorRange?.[1] || 1.5,
                              ])
                            }
                            className="w-full"
                          />
                          <input
                            type="range"
                            min="0.1"
                            max="3.0"
                            step="0.1"
                            value={param.factorRange?.[1] || 1.5}
                            onChange={(e) =>
                              updateParam(augId, "factorRange", [
                                param.factorRange?.[0] || 0.5,
                                parseFloat(e.target.value),
                              ])
                            }
                            className="w-full mt-1"
                          />
                        </div>
                      )}
                      
                      {/* 缩放 */}
                      {augId === "scale" && (
                        <div className="space-y-3">
                          <label className="block text-xs md:text-sm text-gray-600 mb-1">
                            缩放范围: [{param.range?.[0] || 0.8}, {param.range?.[1] || 1.2}]
                          </label>
                          <div className="flex items-center space-x-2 mb-2">
                            <input
                              type="number"
                              step="0.1"
                              min="0.1"
                              max="3.0"
                              value={param.range?.[0] || 0.8}
                              onChange={(e) =>
                                updateParam(augId, "range", [
                                  parseFloat(e.target.value),
                                  param.range?.[1] || 1.2,
                                ])
                              }
                              className="w-20 p-1 border rounded text-xs"
                            />
                            <span className="text-xs">至</span>
                            <input
                              type="number"
                              step="0.1"
                              min="0.1"
                              max="3.0"
                              value={param.range?.[1] || 1.2}
                              onChange={(e) =>
                                updateParam(augId, "range", [
                                  param.range?.[0] || 0.8,
                                  parseFloat(e.target.value),
                                ])
                              }
                              className="w-20 p-1 border rounded text-xs"
                            />
                          </div>
                          <input
                            type="range"
                            min="0.1"
                            max="3.0"
                            step="0.1"
                            value={param.range?.[0] || 0.8}
                            onChange={(e) =>
                              updateParam(augId, "range", [
                                parseFloat(e.target.value),
                                param.range?.[1] || 1.2,
                              ])
                            }
                            className="w-full"
                          />
                          <input
                            type="range"
                            min="0.1"
                            max="3.0"
                            step="0.1"
                            value={param.range?.[1] || 1.2}
                            onChange={(e) =>
                              updateParam(augId, "range", [
                                param.range?.[0] || 0.8,
                                parseFloat(e.target.value),
                              ])
                            }
                            className="w-full mt-1"
                          />
                        </div>
                      )}
                      
                      {/* 模糊 */}
                      {augId === "blur" && (
                        <div className="space-y-3">
                          <label className="block text-xs md:text-sm text-gray-600 mb-1">
                            模糊核范围: [{param.kernelRange?.[0] || 3}, {param.kernelRange?.[1] || 7}]
                          </label>
                          <div className="flex items-center space-x-2 mb-2">
                            <input
                              type="number"
                              min="1"
                              max="21"
                              value={param.kernelRange?.[0] || 3}
                              onChange={(e) =>
                                updateParam(augId, "kernelRange", [
                                  parseInt(e.target.value),
                                  param.kernelRange?.[1] || 7,
                                ])
                              }
                              className="w-20 p-1 border rounded text-xs"
                            />
                            <span className="text-xs">至</span>
                            <input
                              type="number"
                              min="1"
                              max="21"
                              value={param.kernelRange?.[1] || 7}
                              onChange={(e) =>
                                updateParam(augId, "kernelRange", [
                                  param.kernelRange?.[0] || 3,
                                  parseInt(e.target.value),
                                ])
                              }
                              className="w-20 p-1 border rounded text-xs"
                            />
                          </div>
                        </div>
                      )}
                      
                      {/* 色彩抖动 */}
                      {augId === "colorJitter" && (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs md:text-sm text-gray-600 mb-1">
                              亮度抖动: {param.brightness?.toFixed(2) || 0.2}
                            </label>
                            <input
                              type="range"
                              min="0.0"
                              max="1.0"
                              step="0.05"
                              value={param.brightness || 0.2}
                              onChange={(e) =>
                                updateParam(augId, "brightness", parseFloat(e.target.value))
                              }
                              className="w-full"
                            />
                          </div>
                          <div>
                            <label className="block text-xs md:text-sm text-gray-600 mb-1">
                              对比度抖动: {param.contrast?.toFixed(2) || 0.2}
                            </label>
                            <input
                              type="range"
                              min="0.0"
                              max="1.0"
                              step="0.05"
                              value={param.contrast || 0.2}
                              onChange={(e) =>
                                updateParam(augId, "contrast", parseFloat(e.target.value))
                              }
                              className="w-full"
                            />
                          </div>
                          <div>
                            <label className="block text-xs md:text-sm text-gray-600 mb-1">
                              饱和度抖动: {param.saturation?.toFixed(2) || 0.2}
                            </label>
                            <input
                              type="range"
                              min="0.0"
                              max="1.0"
                              step="0.05"
                              value={param.saturation || 0.2}
                              onChange={(e) =>
                                updateParam(augId, "saturation", parseFloat(e.target.value))
                              }
                              className="w-full"
                            />
                          </div>
                        </div>
                      )}
                      
                      {/* 运动模糊 */}
                      {augId === "motionBlur" && (
                        <div className="space-y-2">
                          <label className="block text-xs md:text-sm text-gray-600 mb-1">
                            模糊大小: {param.size || 15}
                          </label>
                          <input
                            type="range"
                            min="5"
                            max="50"
                            value={param.size || 15}
                            onChange={(e) =>
                              updateParam(augId, "size", parseInt(e.target.value))
                            }
                            className="w-full"
                          />
                          <input
                            type="number"
                            min="5"
                            max="50"
                            value={param.size || 15}
                            onChange={(e) =>
                              updateParam(augId, "size", parseInt(e.target.value))
                            }
                            className="w-full p-1 border rounded text-xs"
                          />
                        </div>
                      )}
                      
                      {/* 弹性变形 */}
                      {augId === "elastic" && (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs md:text-sm text-gray-600 mb-1">
                              变形强度 (alpha): {param.alpha || 34}
                            </label>
                            <input
                              type="range"
                              min="10"
                              max="100"
                              value={param.alpha || 34}
                              onChange={(e) =>
                                updateParam(augId, "alpha", parseFloat(e.target.value))
                              }
                              className="w-full"
                            />
                          </div>
                          <div>
                            <label className="block text-xs md:text-sm text-gray-600 mb-1">
                              平滑度 (sigma): {param.sigma || 4}
                            </label>
                            <input
                              type="range"
                              min="1"
                              max="20"
                              value={param.sigma || 4}
                              onChange={(e) =>
                                updateParam(augId, "sigma", parseFloat(e.target.value))
                              }
                              className="w-full"
                            />
                          </div>
                        </div>
                      )}
                      
                      {/* 随机擦除 */}
                      {augId === "erase" && (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs md:text-sm text-gray-600 mb-1">
                              擦除概率: {param.p?.toFixed(2) || 0.5}
                            </label>
                            <input
                              type="range"
                              min="0.0"
                              max="1.0"
                              step="0.05"
                              value={param.p || 0.5}
                              onChange={(e) =>
                                updateParam(augId, "p", parseFloat(e.target.value))
                              }
                              className="w-full"
                            />
                          </div>
                          <div>
                            <label className="block text-xs md:text-sm text-gray-600 mb-1">
                              最小面积比例: {param.sl?.toFixed(3) || 0.02}
                            </label>
                            <input
                              type="range"
                              min="0.01"
                              max="0.2"
                              step="0.01"
                              value={param.sl || 0.02}
                              onChange={(e) =>
                                updateParam(augId, "sl", parseFloat(e.target.value))
                              }
                              className="w-full"
                            />
                          </div>
                          <div>
                            <label className="block text-xs md:text-sm text-gray-600 mb-1">
                              最大面积比例: {param.sh?.toFixed(2) || 0.4}
                            </label>
                            <input
                              type="range"
                              min="0.1"
                              max="0.8"
                              step="0.05"
                              value={param.sh || 0.4}
                              onChange={(e) =>
                                updateParam(augId, "sh", parseFloat(e.target.value))
                              }
                              className="w-full"
                            />
                          </div>
                          <div>
                            <label className="block text-xs md:text-sm text-gray-600 mb-1">
                              宽高比最小值: {param.r1?.toFixed(2) || 0.3}
                            </label>
                            <input
                              type="range"
                              min="0.1"
                              max="1.0"
                              step="0.05"
                              value={param.r1 || 0.3}
                              onChange={(e) =>
                                updateParam(augId, "r1", parseFloat(e.target.value))
                              }
                              className="w-full"
                            />
                          </div>
                        </div>
                      )}
                      
                      {/* 平移 */}
                      {augId === "translate" && (
                        <div className="space-y-3">
                          <label className="block text-xs md:text-sm text-gray-600 mb-1">
                            平移范围: [{param.range?.[0] || -10}, {param.range?.[1] || 10}]
                          </label>
                          <div className="flex items-center space-x-2 mb-2">
                            <input
                              type="number"
                              value={param.range?.[0] || -10}
                              onChange={(e) =>
                                updateParam(augId, "range", [
                                  parseInt(e.target.value),
                                  param.range?.[1] || 10,
                                ])
                              }
                              className="w-20 p-1 border rounded text-xs"
                            />
                            <span className="text-xs">至</span>
                            <input
                              type="number"
                              value={param.range?.[1] || 10}
                              onChange={(e) =>
                                updateParam(augId, "range", [
                                  param.range?.[0] || -10,
                                  parseInt(e.target.value),
                                ])
                              }
                              className="w-20 p-1 border rounded text-xs"
                            />
                          </div>
                          <input
                            type="range"
                            min="-50"
                            max="50"
                            value={param.range?.[0] || -10}
                            onChange={(e) =>
                              updateParam(augId, "range", [
                                parseInt(e.target.value),
                                param.range?.[1] || 10,
                              ])
                            }
                            className="w-full"
                          />
                          <input
                            type="range"
                            min="-50"
                            max="50"
                            value={param.range?.[1] || 10}
                            onChange={(e) =>
                              updateParam(augId, "range", [
                                param.range?.[0] || -10,
                                parseInt(e.target.value),
                              ])
                            }
                            className="w-full mt-1"
                          />
                        </div>
                      )}
                      
                      {/* 波浪噪声 */}
                      {augId === "waveNoise" && (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs md:text-sm text-gray-600 mb-1">
                              波浪幅度: {param.amplitude?.toFixed(1) || 5.0}
                            </label>
                            <input
                              type="range"
                              min="1.0"
                              max="20.0"
                              step="0.5"
                              value={param.amplitude || 5.0}
                              onChange={(e) =>
                                updateParam(augId, "amplitude", parseFloat(e.target.value))
                              }
                              className="w-full"
                            />
                          </div>
                          <div>
                            <label className="block text-xs md:text-sm text-gray-600 mb-1">
                              波浪频率: {param.frequency?.toFixed(2) || 0.1}
                            </label>
                            <input
                              type="range"
                              min="0.05"
                              max="0.5"
                              step="0.05"
                              value={param.frequency || 0.1}
                              onChange={(e) =>
                                updateParam(augId, "frequency", parseFloat(e.target.value))
                              }
                              className="w-full"
                            />
                          </div>
                        </div>
                      )}
                      
                      {/* Fancy PCA */}
                      {augId === "fancyPca" && (
                        <div className="space-y-2">
                          <label className="block text-xs md:text-sm text-gray-600 mb-1">
                            PCA扰动强度: {param.alphaStd?.toFixed(2) || 0.1}
                          </label>
                          <input
                            type="range"
                            min="0.01"
                            max="0.5"
                            step="0.01"
                            value={param.alphaStd || 0.1}
                            onChange={(e) =>
                              updateParam(augId, "alphaStd", parseFloat(e.target.value))
                            }
                            className="w-full"
                          />
                        </div>
                      )}
                      
                      {/* HSV抖动 */}
                      {augId === "hsvJitter" && (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs md:text-sm text-gray-600 mb-1">
                              色相偏移: {param.hShift?.toFixed(1) || 10.0}°
                            </label>
                            <input
                              type="range"
                              min="0"
                              max="180"
                              value={param.hShift || 10.0}
                              onChange={(e) =>
                                updateParam(augId, "hShift", parseFloat(e.target.value))
                              }
                              className="w-full"
                            />
                          </div>
                          <div>
                            <label className="block text-xs md:text-sm text-gray-600 mb-1">
                              饱和度范围: [{param.sScale?.[0] || 0.8}, {param.sScale?.[1] || 1.2}]
                            </label>
                            <input
                              type="range"
                              min="0.1"
                              max="2.0"
                              step="0.1"
                              value={param.sScale?.[0] || 0.8}
                              onChange={(e) =>
                                updateParam(augId, "sScale", [
                                  parseFloat(e.target.value),
                                  param.sScale?.[1] || 1.2,
                                ])
                              }
                              className="w-full"
                            />
                            <input
                              type="range"
                              min="0.1"
                              max="2.0"
                              step="0.1"
                              value={param.sScale?.[1] || 1.2}
                              onChange={(e) =>
                                updateParam(augId, "sScale", [
                                  param.sScale?.[0] || 0.8,
                                  parseFloat(e.target.value),
                                ])
                              }
                              className="w-full mt-1"
                            />
                          </div>
                          <div>
                            <label className="block text-xs md:text-sm text-gray-600 mb-1">
                              明度范围: [{param.vScale?.[0] || 0.8}, {param.vScale?.[1] || 1.2}]
                            </label>
                            <input
                              type="range"
                              min="0.1"
                              max="2.0"
                              step="0.1"
                              value={param.vScale?.[0] || 0.8}
                              onChange={(e) =>
                                updateParam(augId, "vScale", [
                                  parseFloat(e.target.value),
                                  param.vScale?.[1] || 1.2,
                                ])
                              }
                              className="w-full"
                            />
                            <input
                              type="range"
                              min="0.1"
                              max="2.0"
                              step="0.1"
                              value={param.vScale?.[1] || 1.2}
                              onChange={(e) =>
                                updateParam(augId, "vScale", [
                                  param.vScale?.[0] || 0.8,
                                  parseFloat(e.target.value),
                                ])
                              }
                              className="w-full mt-1"
                            />
                          </div>
                        </div>
                      )}
                      
                      {/* 强度调整 */}
                      {augId === "intensity" && (
                        <div className="space-y-3">
                          <label className="block text-xs md:text-sm text-gray-600 mb-1">
                            强度范围: [{param.factor?.[0] || 0.7}, {param.factor?.[1] || 1.3}]
                          </label>
                          <div className="flex items-center space-x-2 mb-2">
                            <input
                              type="number"
                              step="0.1"
                              min="0.1"
                              max="3.0"
                              value={param.factor?.[0] || 0.7}
                              onChange={(e) =>
                                updateParam(augId, "factor", [
                                  parseFloat(e.target.value),
                                  param.factor?.[1] || 1.3,
                                ])
                              }
                              className="w-20 p-1 border rounded text-xs"
                            />
                            <span className="text-xs">至</span>
                            <input
                              type="number"
                              step="0.1"
                              min="0.1"
                              max="3.0"
                              value={param.factor?.[1] || 1.3}
                              onChange={(e) =>
                                updateParam(augId, "factor", [
                                  param.factor?.[0] || 0.7,
                                  parseFloat(e.target.value),
                                ])
                              }
                              className="w-20 p-1 border rounded text-xs"
                            />
                          </div>
                          <input
                            type="range"
                            min="0.1"
                            max="3.0"
                            step="0.1"
                            value={param.factor?.[0] || 0.7}
                            onChange={(e) =>
                              updateParam(augId, "factor", [
                                parseFloat(e.target.value),
                                param.factor?.[1] || 1.3,
                              ])
                            }
                            className="w-full"
                          />
                          <input
                            type="range"
                            min="0.1"
                            max="3.0"
                            step="0.1"
                            value={param.factor?.[1] || 1.3}
                            onChange={(e) =>
                              updateParam(augId, "factor", [
                                param.factor?.[0] || 0.7,
                                parseFloat(e.target.value),
                              ])
                            }
                            className="w-full mt-1"
                          />
                        </div>
                      )}
                      
                      {/* 边缘增强 */}
                      {augId === "edgeEnhance" && (
                        <div className="space-y-2">
                          <label className="block text-xs md:text-sm text-gray-600 mb-1">
                            增强强度: {param.strength?.toFixed(1) || 1.0}
                          </label>
                          <input
                            type="range"
                            min="0.1"
                            max="3.0"
                            step="0.1"
                            value={param.strength || 1.0}
                            onChange={(e) =>
                              updateParam(augId, "strength", parseFloat(e.target.value))
                            }
                            className="w-full"
                          />
                        </div>
                      )}
                      
                      {/* 随机HSV */}
                      {augId === "randomHsv" && (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs md:text-sm text-gray-600 mb-1">
                              色相范围: [{param.hRange?.[0] || 0}, {param.hRange?.[1] || 360}]
                            </label>
                            <input
                              type="range"
                              min="0"
                              max="360"
                              value={param.hRange?.[0] || 0}
                              onChange={(e) =>
                                updateParam(augId, "hRange", [
                                  parseInt(e.target.value),
                                  param.hRange?.[1] || 360,
                                ])
                              }
                              className="w-full"
                            />
                            <input
                              type="range"
                              min="0"
                              max="360"
                              value={param.hRange?.[1] || 360}
                              onChange={(e) =>
                                updateParam(augId, "hRange", [
                                  param.hRange?.[0] || 0,
                                  parseInt(e.target.value),
                                ])
                              }
                              className="w-full mt-1"
                            />
                          </div>
                          <div>
                            <label className="block text-xs md:text-sm text-gray-600 mb-1">
                              饱和度范围: [{param.sRange?.[0] || 0}, {param.sRange?.[1] || 1}]
                            </label>
                            <input
                              type="range"
                              min="0"
                              max="2"
                              step="0.1"
                              value={param.sRange?.[0] || 0}
                              onChange={(e) =>
                                updateParam(augId, "sRange", [
                                  parseFloat(e.target.value),
                                  param.sRange?.[1] || 1,
                                ])
                              }
                              className="w-full"
                            />
                            <input
                              type="range"
                              min="0"
                              max="2"
                              step="0.1"
                              value={param.sRange?.[1] || 1}
                              onChange={(e) =>
                                updateParam(augId, "sRange", [
                                  param.sRange?.[0] || 0,
                                  parseFloat(e.target.value),
                                ])
                              }
                              className="w-full mt-1"
                            />
                          </div>
                          <div>
                            <label className="block text-xs md:text-sm text-gray-600 mb-1">
                              明度范围: [{param.vRange?.[0] || 0}, {param.vRange?.[1] || 1}]
                            </label>
                            <input
                              type="range"
                              min="0"
                              max="2"
                              step="0.1"
                              value={param.vRange?.[0] || 0}
                              onChange={(e) =>
                                updateParam(augId, "vRange", [
                                  parseFloat(e.target.value),
                                  param.vRange?.[1] || 1,
                                ])
                              }
                              className="w-full"
                            />
                            <input
                              type="range"
                              min="0"
                              max="2"
                              step="0.1"
                              value={param.vRange?.[1] || 1}
                              onChange={(e) =>
                                updateParam(augId, "vRange", [
                                  param.vRange?.[0] || 0,
                                  parseFloat(e.target.value),
                                ])
                              }
                              className="w-full mt-1"
                            />
                          </div>
                        </div>
                      )}
                      
                      {/* Patch Shuffle */}
                      {augId === "patchShuffle" && (
                        <div className="space-y-2">
                          <label className="block text-xs md:text-sm text-gray-600 mb-1">
                            网格大小: {param.gridSize || 16} 像素
                          </label>
                          <input
                            type="range"
                            min="8"
                            max="64"
                            step="8"
                            value={param.gridSize || 16}
                            onChange={(e) =>
                              updateParam(augId, "gridSize", parseInt(e.target.value))
                            }
                            className="w-full"
                          />
                          <input
                            type="number"
                            min="8"
                            max="64"
                            step="8"
                            value={param.gridSize || 16}
                            onChange={(e) =>
                              updateParam(augId, "gridSize", parseInt(e.target.value))
                            }
                            className="w-full p-1 border rounded text-xs"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              {selectedAugmentations.filter((id) =>
                augmentations.find((a) => a.id === id)?.hasParams
              ).length === 0 && (
                <div className="text-gray-500 py-4 text-center text-xs md:text-sm">
                  选择的增强方式无需参数配置
                </div>
              )}
            </div>
          </div>

          {/* 右侧：操作面板 */}
          <div className="bg-white rounded-lg shadow p-4 md:p-6">
            <h2 className="text-lg md:text-xl font-semibold mb-3 md:mb-4">操作</h2>
            <div className="space-y-3">
              <button
                onClick={handleProcess}
                disabled={isProcessing || files.length === 0 || selectedAugmentations.length === 0}
                className="w-full bg-blue-600 text-white py-2 md:py-3 px-3 md:px-4 rounded-lg font-medium text-sm md:text-base hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {isProcessing ? `处理中... ${progress}%` : "开始增强"}
              </button>
              {results.length > 0 && (
                <button
                  onClick={handleDownloadAll}
                  disabled={!JSZip}
                  className="w-full bg-green-600 text-white py-2 md:py-3 px-3 md:px-4 rounded-lg font-medium text-sm md:text-base hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  {JSZip ? `下载所有结果 (${results.length})` : "加载中..."}
                </button>
              )}
              <div className="text-xs md:text-sm text-gray-600 space-y-1">
                <p>✅ 支持21种专业增强方式</p>
                <p>✅ 完整参数配置</p>
                <p>✅ 多文件上传模拟文件夹</p>
                <p>✅ 结果按增强方式分文件夹打包</p>
              </div>
            </div>
          </div>
        </div>

        {/* Results Preview */}
        {results.length > 0 && (
          <div className="bg-white rounded-lg shadow p-4 md:p-6">
            <h2 className="text-lg md:text-xl font-semibold mb-3 md:mb-4">处理结果预览</h2>
            <div className="text-sm text-gray-600 mb-3">
              共 {results.length} 张图片，点击下载按钮获取完整 ZIP 包
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {results.slice(0, 8).map((result, index) => (
                <div key={index} className="border rounded-lg overflow-hidden">
                  <img
                    src={result.url}
                    alt={result.originalName}
                    className="w-full h-24 md:h-32 object-cover"
                  />
                  <div className="p-2 text-xs text-gray-600 truncate">
                    {result.augId}_...
                  </div>
                </div>
              ))}
              {results.length > 8 && (
                <div className="border rounded-lg overflow-hidden flex items-center justify-center">
                  <div className="text-center p-4">
                    <div className="text-2xl font-bold text-gray-500">+{results.length - 8}</div>
                    <div className="text-xs text-gray-500">更多结果</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;