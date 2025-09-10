import React, { useState, useRef, useCallback } from "react";

const App = () => {
  const [files, setFiles] = useState([]);
  const [selectedAugmentations, setSelectedAugmentations] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState([]);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef(null);

  // 增强参数状态
  const [params, setParams] = useState({
    rotate: { angleRange: [-30, 30] },
    crop: { ratio: 0.8 },
    noise: { mode: "gaussian" },
    brightness: { factorRange: [0.5, 1.5] },
  });

  // 所有支持的增强方式
  const augmentations = [
    { id: "hflip", name: "水平翻转", hasParams: false },
    { id: "vflip", name: "垂直翻转", hasParams: false },
    { id: "rotate", name: "旋转", hasParams: true },
    { id: "crop", name: "裁剪", hasParams: true },
    { id: "noise", name: "噪声", hasParams: true },
    { id: "brightness", name: "亮度", hasParams: true },
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

  // 模拟图像处理（前端 canvas 操作）
  const applyAugmentation = (img, augId, param) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = img.width;
    canvas.height = img.height;

    if (augId === "hflip") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0);
    } else if (augId === "brightness") {
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const factor = (param.factorRange[0] + param.factorRange[1]) / 2;
      for (let i = 0; i < imageData.data.length; i += 4) {
        imageData.data[i] = Math.min(255, imageData.data[i] * factor);
        imageData.data[i + 1] = Math.min(255, imageData.data[i + 1] * factor);
        imageData.data[i + 2] = Math.min(255, imageData.data[i + 2] * factor);
      }
      ctx.putImageData(imageData, 0, 0);
    } else if (augId === "rotate") {
      const angle = ((param.angleRange[0] + param.angleRange[1]) / 2) * Math.PI / 180;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(angle);
      ctx.translate(-img.width / 2, -img.height / 2);
      ctx.drawImage(img, 0, 0);
    } else if (augId === "crop") {
      const size = Math.min(img.width, img.height) * param.ratio;
      const x = (img.width - size) / 2;
      const y = (img.height - size) / 2;
      ctx.drawImage(img, x, y, size, size, 0, 0, canvas.width, canvas.height);
    } else {
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
      }

      URL.revokeObjectURL(url);
    }

    setResults(newResults);
    setIsProcessing(false);
  };

  // 下载所有结果
  const handleDownloadAll = () => {
    results.forEach((result) => {
      const link = document.createElement("a");
      link.href = result.url;
      link.download = `${result.augId}_${result.originalName}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6 md:mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-800 mb-2">
            图像数据增强工具
          </h1>
          <p className="text-gray-600">上传图片，选择增强方式，一键处理并下载</p>
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
                ? `已选择 ${files.length} 张图片`
                : "点击或拖拽图片到此区域上传"}
            </p>
          </div>
        </div>

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
                      {augId === "rotate" && (
                        <div className="space-y-2">
                          <div>
                            <label className="block text-xs md:text-sm text-gray-600 mb-1">
                              角度范围: [{param.angleRange?.[0] || -30}°, {param.angleRange?.[1] || 30}°]
                            </label>
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
                      {augId === "brightness" && (
                        <div className="space-y-2">
                          <div>
                            <label className="block text-xs md:text-sm text-gray-600 mb-1">
                              亮度范围: [{param.factorRange?.[0] || 0.5}, {param.factorRange?.[1] || 1.5}]
                            </label>
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
                        </div>
                      )}
                      {augId === "noise" && (
                        <div>
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
                          </select>
                        </div>
                      )}
                      {augId === "crop" && (
                        <div>
                          <label className="block text-xs md:text-sm text-gray-600 mb-1">
                            裁剪比例: {param.ratio || 0.8}
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
                  className="w-full bg-green-600 text-white py-2 md:py-3 px-3 md:px-4 rounded-lg font-medium text-sm md:text-base hover:bg-green-700 transition-colors"
                >
                  下载所有结果 ({results.length})
                </button>
              )}
              <div className="text-xs md:text-sm text-gray-600 space-y-1">
                <p>✅ 支持 JPG/PNG 格式</p>
                <p>✅ 前端处理，隐私安全</p>
                <p>✅ 结果自动命名</p>
              </div>
            </div>
          </div>
        </div>

        {/* Results Preview */}
        {results.length > 0 && (
          <div className="bg-white rounded-lg shadow p-4 md:p-6">
            <h2 className="text-lg md:text-xl font-semibold mb-3 md:mb-4">处理结果预览</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {results.map((result, index) => (
                <div key={index} className="border rounded-lg overflow-hidden">
                  <img
                    src={result.url}
                    alt={result.originalName}
                    className="w-full h-24 md:h-32 object-cover"
                  />
                  <div className="p-2 text-xs text-gray-600 truncate">
                    {result.augId}_{result.originalName}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;