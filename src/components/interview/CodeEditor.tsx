"use client";
import Editor from "@monaco-editor/react";

type Props = {
  language: string;
  value: string;
  onChange: (value: string) => void;
};

export default function CodeEditor({ language, value, onChange }: Props) {
  return (
    <Editor
      height="100%"
      language={language.toLowerCase()}
      value={value}
      theme="vs-dark"
      onChange={(v) => onChange(v ?? "")}
      options={{
        fontSize: 14,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        wordWrap: "on",
      }}
    />
  );
}
