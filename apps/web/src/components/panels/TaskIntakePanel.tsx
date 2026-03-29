import type { ReactNode } from "react";

type TaskIntakePanelProps = {
  websiteInput: string;
  setWebsiteInput: (value: string) => void;
  docsInput: string;
  setDocsInput: (value: string) => void;
  whitepaperInputKey: number;
  setWhitepaperFile: (file: File | null) => void;
  whitepaperFile: File | null;
  selectedTaskId: string | null;
  twitterInput: string;
  setTwitterInput: (value: string) => void;
  telegramInput: string;
  setTelegramInput: (value: string) => void;
  discordInput: string;
  setDiscordInput: (value: string) => void;
  chainInput: string;
  setChainInput: (value: string) => void;
  chainOptions: Array<{ value: string; label: string }>;
  contractInput: string;
  setContractInput: (value: string) => void;
  notesInput: string;
  setNotesInput: (value: string) => void;
  stageGate: ReactNode;
};

export function TaskIntakePanel(props: TaskIntakePanelProps) {
  return (
    <div className="intake-card">
      <p className="eyebrow">Task Stages</p>
      <div className="intake-field">
        <label>
          <span>Website</span>
          <input value={props.websiteInput} onChange={(event) => props.setWebsiteInput(event.target.value)} />
        </label>
      </div>
      <div className="intake-field">
        <label>
          <span>Docs / Whitepaper</span>
          <input value={props.docsInput} onChange={(event) => props.setDocsInput(event.target.value)} />
        </label>
      </div>
      <div className="intake-inline-action">
        <label className="file-picker">
          <span>Whitepaper PDF 文件</span>
          <input
            key={props.whitepaperInputKey}
            type="file"
            accept=".pdf,application/pdf"
            onChange={(event) => props.setWhitepaperFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <p className="muted">
          Docs / Whitepaper 支持填写 URL，也支持直接上传 PDF 文件。
          {props.whitepaperFile ? ` 当前已选择：${props.whitepaperFile.name}` : " 当前未选择文件。"}
        </p>
        <p className="muted">{props.selectedTaskId ? "已选中任务，可直接解析 Whitepaper PDF。" : "先创建或选中任务后，才能解析 Whitepaper PDF。"}</p>
      </div>
      <div className="intake-field">
        <label>
          <span>Twitter / X</span>
          <input value={props.twitterInput} onChange={(event) => props.setTwitterInput(event.target.value)} />
        </label>
      </div>
      <div className="intake-field">
        <label>
          <span>Telegram</span>
          <input value={props.telegramInput} onChange={(event) => props.setTelegramInput(event.target.value)} />
        </label>
      </div>
      <div className="intake-field">
        <label>
          <span>Discord</span>
          <input value={props.discordInput} onChange={(event) => props.setDiscordInput(event.target.value)} />
        </label>
      </div>
      <label>
        <span>Target Chain</span>
        <select value={props.chainInput} onChange={(event) => props.setChainInput(event.target.value)}>
          {props.chainOptions.map((chain) => (
            <option key={chain.value} value={chain.value}>
              {chain.label}
            </option>
          ))}
        </select>
      </label>
      <div className="intake-field intake-field-area">
        <label>
          <span>Contracts</span>
          <textarea value={props.contractInput} onChange={(event) => props.setContractInput(event.target.value)} placeholder={"每行一个合约地址，支持多个"} />
        </label>
      </div>
      <label>
        <span>Notes</span>
        <textarea value={props.notesInput} onChange={(event) => props.setNotesInput(event.target.value)} />
      </label>

      {props.stageGate}
    </div>
  );
}
