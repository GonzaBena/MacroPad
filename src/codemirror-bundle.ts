import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { defaultKeymap, indentWithTab, history, historyKeymap } from "@codemirror/commands";
import { indentOnInput, bracketMatching, foldGutter, syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { closeBrackets, autocompletion, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { python } from "@codemirror/lang-python";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";

const langCompartment = new Compartment();

function getExtensions(lang: string) {
  const langExt = lang === "python" ? python() : javascript();
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    drawSelection(),
    foldGutter(),
    history(),
    bracketMatching(),
    closeBrackets(),
    indentOnInput(),
    autocompletion(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    oneDark,
    keymap.of([
      indentWithTab,
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...historyKeymap,
      ...completionKeymap,
    ]),
    langCompartment.of(langExt),
    EditorView.theme({
      "&": { height: "100%", fontSize: "13px" },
      ".cm-scroller": { fontFamily: "'Space Mono', monospace", lineHeight: "1.5", overflow: "auto" },
      ".cm-content": { padding: "10px 0" },
      ".cm-line": { padding: "0 10px" },
      ".cm-gutters": { borderRight: "1px solid #333", paddingRight: "4px" },
    }),
  ];
}

export interface CodeMirrorEditor {
  getValue(): string;
  setValue(code: string): void;
  setLang(lang: string): void;
  focus(): void;
  destroy(): void;
}

export function createEditor(parent: HTMLElement, initialCode: string, lang: string): CodeMirrorEditor {
  const view = new EditorView({
    state: EditorState.create({
      doc: initialCode,
      extensions: getExtensions(lang),
    }),
    parent,
  });

  return {
    getValue: () => view.state.doc.toString(),
    setValue: (code: string) => {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } });
    },
    setLang: (newLang: string) => {
      const langExt = newLang === "python" ? python() : javascript();
      view.dispatch({ effects: langCompartment.reconfigure(langExt) });
    },
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  };
}

// Expose globally for use from non-module scripts
(window as any).CodeMirrorEditor = { createEditor };
