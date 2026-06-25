import { Eye, EyeOff, RotateCcw } from "lucide-react";
import { useState } from "react";
import type { Settings } from "../types";

type SettingsPanelProps = {
  settings: Settings;
  onChange: (settings: Settings) => void;
  onClearContext: () => void;
};

export function SettingsPanel({ settings, onChange, onClearContext }: SettingsPanelProps) {
  const [showKey, setShowKey] = useState(false);

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    onChange({ ...settings, [key]: value });
  }

  return (
    <aside className="control-panel">
      <div className="brand-block">
        <div className="blueprint-mark" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div>
          <h1>Image2 对话助手</h1>
          <p>本地网页应用 · 多图输入 · 多轮图像对话</p>
        </div>
      </div>

      <section className="panel-section">
        <label htmlFor="apiKey">OpenAI API Key</label>
        <div className="key-row">
          <input
            id="apiKey"
            type={showKey ? "text" : "password"}
            autoComplete="off"
            placeholder="sk-..."
            value={settings.apiKey}
            onChange={(event) => update("apiKey", event.target.value)}
          />
          <button
            className="icon-button"
            type="button"
            title={showKey ? "隐藏 API Key" : "显示 API Key"}
            onClick={() => setShowKey((value) => !value)}
          >
            {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        <p className="microcopy">Key 只保存在此浏览器，并随请求发给本机代理服务。</p>

        <label htmlFor="baseUrl" className="stacked-label">
          Base URL
        </label>
        <input
          id="baseUrl"
          type="url"
          autoComplete="off"
          placeholder="https://api.openai.com/v1"
          value={settings.baseUrl}
          onChange={(event) => update("baseUrl", event.target.value)}
        />
        <p className="microcopy">可填写 OpenAI 兼容代理地址；只填域名时服务端会自动补 `/v1`。</p>
      </section>

      <section className="panel-section compact-grid">
        <div>
          <label htmlFor="reasoningModel">对话模型</label>
          <input
            id="reasoningModel"
            value={settings.reasoningModel}
            onChange={(event) => update("reasoningModel", event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="imageModel">Image2 模型</label>
          <input
            id="imageModel"
            value={settings.imageModel}
            onChange={(event) => update("imageModel", event.target.value)}
          />
        </div>
      </section>

      <section className="panel-section compact-grid">
        <div>
          <label htmlFor="size">尺寸</label>
          <select
            id="size"
            value={settings.size}
            onChange={(event) => update("size", event.target.value)}
          >
            <option>1024x1024</option>
            <option>1024x1536</option>
            <option>1536x1024</option>
            <option>auto</option>
          </select>
        </div>
        <div>
          <label htmlFor="quality">质量</label>
          <select
            id="quality"
            value={settings.quality}
            onChange={(event) => update("quality", event.target.value)}
          >
            <option>auto</option>
            <option>high</option>
            <option>medium</option>
            <option>low</option>
          </select>
        </div>
        <div className="full-row">
          <label htmlFor="outputFormat">格式</label>
          <select
            id="outputFormat"
            value={settings.outputFormat}
            onChange={(event) => update("outputFormat", event.target.value as Settings["outputFormat"])}
          >
            <option value="png">PNG</option>
            <option value="jpeg">JPG</option>
          </select>
        </div>
      </section>

      <section className="panel-section">
        <button className="secondary-button wide-button" type="button" onClick={onClearContext}>
          <RotateCcw size={16} />
          清空上下文
        </button>
      </section>
    </aside>
  );
}
