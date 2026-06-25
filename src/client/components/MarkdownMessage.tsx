import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownMessageProps = {
  text: string;
  error?: boolean;
};

export function MarkdownMessage({ text, error }: MarkdownMessageProps) {
  if (!text) return null;

  return (
    <div className={`markdown-body${error ? " error-text" : ""}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}
