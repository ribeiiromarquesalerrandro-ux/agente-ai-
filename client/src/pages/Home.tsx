import { useAuth } from "@/_core/hooks/useAuth";
import { AIChatBox, type Message as ChatMessage } from "@/components/AIChatBox";
import { CommandDeck } from "@/components/CommandDeck";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import {
  Bot,
  Brackets,
  CheckCircle2,
  CircleDot,
  CloudSun,
  Code2,
  Download,
  FolderGit2,
  ImagePlus,
  Loader2,
  Menu,
  MessageSquareText,
  Mic,
  Plus,
  Radio,
  Settings2,
  TerminalSquare,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type View = "chat" | "tools" | "config" | "desktop" | "github" | "access";

const NAVIGATION: Array<{ id: View; label: string; icon: typeof MessageSquareText }> = [
  { id: "chat", label: "Consola", icon: MessageSquareText },
  { id: "tools", label: "Ferramentas", icon: TerminalSquare },
  { id: "config", label: "Agente", icon: Settings2 },
  { id: "github", label: "GitHub", icon: FolderGit2 },
  { id: "desktop", label: "Desktop", icon: Download },
];

function systemMessageError(error: unknown) {
  return error instanceof Error ? error.message : "Falha de sistema. Tente novamente.";
}

function makeOllamaUrl(baseUrl: string, endpoint: string) {
  return `${baseUrl.replace(/\/$/, "")}${endpoint}`;
}

async function readOllamaModels(baseUrl: string) {
  const response = await fetch(makeOllamaUrl(baseUrl, "/api/tags"));
  if (!response.ok) throw new Error(`Ollama respondeu com ${response.status}.`);
  const payload = (await response.json()) as { models?: Array<{ name: string }> };
  return payload.models?.map((model) => model.name) ?? [];
}

function SystemMark() {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="system-mark" aria-hidden="true"><Brackets className="size-5" /></div>
      <div className="min-w-0">
        <p className="glitch-title truncate text-sm font-extrabold tracking-[0.26em]">AGENTE//LOCAL</p>
        <p className="font-mono text-[10px] tracking-[0.16em] text-cyan-300/70">SYS_FAILURE : ONLINE</p>
      </div>
    </div>
  );
}

function LoginScreen() {
  return (
    <main className="system-page flex min-h-screen items-center justify-center px-5">
      <section className="system-card relative max-w-xl overflow-hidden p-7 sm:p-10">
        <div className="absolute right-6 top-6 font-mono text-xs text-fuchsia-300">ERR_00 // ACCESS_REQUIRED</div>
        <SystemMark />
        <div className="mt-12 max-w-md">
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-cyan-300">Nó de inferência local</p>
          <h1 className="glitch-title mt-3 text-4xl font-black leading-none sm:text-5xl">CONECTE PARA INICIAR</h1>
          <p className="mt-5 leading-7 text-zinc-300">Acesse seu perfil para operar o agente, salvar conversas e controlar as ferramentas autorizadas.</p>
          <Button onClick={() => startLogin()} className="system-button mt-8 h-11 px-5"><Radio className="mr-2 size-4" />AUTENTICAR</Button>
        </div>
      </section>
    </main>
  );
}

export default function Home() {
  const { user, loading, logout } = useAuth();
  const [view, setView] = useState<View>("chat");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [streamingContent, setStreamingContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const utils = trpc.useUtils();

  const settingsQuery = trpc.agent.settings.useQuery(undefined, { enabled: Boolean(user) });
  const conversationsQuery = trpc.conversations.list.useQuery(undefined, { enabled: Boolean(user) });
  const messagesQuery = trpc.conversations.messages.useQuery(
    { conversationId: selectedConversationId ?? 0 },
    { enabled: Boolean(selectedConversationId) },
  );
  const githubStatus = trpc.agent.githubStatus.useQuery(undefined, { enabled: Boolean(user) });
  const createConversation = trpc.conversations.create.useMutation({
    onSuccess: async (conversation) => {
      await utils.conversations.list.invalidate();
      setSelectedConversationId(conversation.id);
      setView("chat");
    },
    onError: (error) => toast.error(systemMessageError(error)),
  });
  const saveMessage = trpc.conversations.saveMessage.useMutation();
  const saveSettings = trpc.agent.saveSettings.useMutation({
    onSuccess: async () => {
      await utils.agent.settings.invalidate();
      toast.success("Configuração sincronizada.");
    },
    onError: (error) => toast.error(systemMessageError(error)),
  });
  const transcribeAudio = trpc.multimodal.transcribeAudio.useMutation({
    onSuccess: (data) => {
      toast.success("Voz transcrita. Enviando ao agente.");
      void sendMessage(data.text);
    },
    onError: (error) => toast.error(systemMessageError(error)),
  });
  const generateImage = trpc.multimodal.generateImage.useMutation({
    onSuccess: async (data) => {
      if (!selectedConversationId) return;
      const content = `![Imagem gerada](${data.url})`;
      await saveMessage.mutateAsync({ conversationId: selectedConversationId, role: "assistant", content, attachmentUrl: data.url });
      await utils.conversations.messages.invalidate({ conversationId: selectedConversationId });
      toast.success("Imagem adicionada ao histórico.");
    },
    onError: (error) => toast.error(systemMessageError(error)),
  });

  const [draft, setDraft] = useState({
    ollamaUrl: "http://localhost:11434",
    activeModel: "llama3.2",
    temperature: 70,
    contextSize: 8192,
    systemPrompt: "",
    weatherEnabled: true,
    newsEnabled: true,
    currencyEnabled: true,
    githubEnabled: false,
  });

  useEffect(() => {
    const settings = settingsQuery.data;
    if (!settings) return;
    setDraft({
      ollamaUrl: settings.ollamaUrl,
      activeModel: settings.activeModel,
      temperature: settings.temperature,
      contextSize: settings.contextSize,
      systemPrompt: settings.systemPrompt,
      weatherEnabled: Boolean(settings.weatherEnabled),
      newsEnabled: Boolean(settings.newsEnabled),
      currencyEnabled: Boolean(settings.currencyEnabled),
      githubEnabled: Boolean(settings.githubEnabled),
    });
  }, [settingsQuery.data]);

  useEffect(() => {
    if (!selectedConversationId && conversationsQuery.data?.[0]) setSelectedConversationId(conversationsQuery.data[0].id);
  }, [conversationsQuery.data, selectedConversationId]);

  const persistedMessages = useMemo<ChatMessage[]>(() => (messagesQuery.data ?? []).map((message) => ({
    role: message.role === "tool" ? "assistant" : message.role as ChatMessage["role"],
    content: message.content,
  })), [messagesQuery.data]);
  const visibleMessages = streamingContent ? [...persistedMessages, { role: "assistant" as const, content: streamingContent }] : persistedMessages;

  async function createNewConversation() {
    await createConversation.mutateAsync({ title: "Nova conversa" });
  }

  async function connectOllama() {
    try {
      const models = await readOllamaModels(draft.ollamaUrl);
      const allowed = settingsQuery.data?.allowedModels ?? [];
      const visibleModels = allowed.length ? models.filter((model) => allowed.includes(model)) : models;
      setOllamaModels(visibleModels);
      toast.success(visibleModels.length ? `${visibleModels.length} modelos autorizados detectados.` : "Nenhum modelo autorizado foi detectado no Ollama.");
    } catch (error) {
      toast.error(`Não foi possível conectar ao Ollama: ${systemMessageError(error)}`);
    }
  }

  async function sendMessage(content: string) {
    if (!selectedConversationId) {
      toast.info("Crie ou selecione uma conversa antes de enviar.");
      return;
    }
    if (!settingsQuery.data) {
      toast.error("As configurações do agente ainda não estão disponíveis.");
      return;
    }
    if (!settingsQuery.data.allowedModels.includes(settingsQuery.data.activeModel)) {
      toast.error("O modelo ativo não está liberado pelo owner para este plano.");
      return;
    }
    try {
      setIsStreaming(true);
      setStreamingContent("");
      await saveMessage.mutateAsync({ conversationId: selectedConversationId, role: "user", content });
      const savedMessages = await utils.conversations.messages.fetch({ conversationId: selectedConversationId });
      const memories = await utils.agent.memory.fetch({ query: content });
      const contextualMemory = memories.length ? `\n\nMemória relevante do usuário:\n${memories.map((item, index) => `${index + 1}. ${item}`).join("\n")}` : "";
      const ollamaMessages = [
        { role: "system", content: `${settingsQuery.data.systemPrompt}${contextualMemory}` },
        ...savedMessages.filter((message) => message.role !== "system").map((message) => ({ role: message.role, content: message.content })),
      ];
      const response = await fetch(makeOllamaUrl(settingsQuery.data.ollamaUrl, "/api/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: settingsQuery.data.activeModel,
          stream: true,
          messages: ollamaMessages,
          options: { temperature: settingsQuery.data.temperature / 100, num_ctx: settingsQuery.data.contextSize },
        }),
      });
      if (!response.ok || !response.body) throw new Error(`Ollama respondeu com ${response.status}. Verifique URL, CORS e modelo ativo.`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let complete = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const rows = buffer.split("\n");
        buffer = rows.pop() ?? "";
        for (const row of rows) {
          if (!row.trim()) continue;
          try {
            const event = JSON.parse(row) as { message?: { content?: string } };
            const part = event.message?.content ?? "";
            complete += part;
            setStreamingContent(complete);
          } catch {
            // Eventos parciais do streaming são mantidos no buffer para a próxima leitura.
          }
        }
      }
      if (complete.trim()) await saveMessage.mutateAsync({ conversationId: selectedConversationId, role: "assistant", content: complete });
      await utils.conversations.messages.invalidate({ conversationId: selectedConversationId });
      await utils.conversations.list.invalidate();
    } catch (error) {
      toast.error(systemMessageError(error));
    } finally {
      setStreamingContent("");
      setIsStreaming(false);
    }
  }

  async function exportConversation(format: "json" | "csv" | "text") {
    if (!selectedConversationId) return;
    try {
      const file = await utils.conversations.export.fetch({ conversationId: selectedConversationId, format });
      const url = URL.createObjectURL(new Blob([file.content], { type: file.contentType }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.filename;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success(`Exportação ${format.toUpperCase()} concluída.`);
    } catch (error) {
      toast.error(systemMessageError(error));
    }
  }

  async function handleImageRequest() {
    const prompt = window.prompt("Descrição da imagem a gerar:");
    if (prompt?.trim()) await generateImage.mutateAsync({ prompt: prompt.trim() });
  }

  async function toggleVoice() {
    if (isRecording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => audioChunksRef.current.push(event.data);
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        setIsRecording(false);
        const reader = new FileReader();
        reader.onload = () => transcribeAudio.mutate({
          dataUrl: String(reader.result),
          mimeType: "audio/webm",
          fileName: `voz-${Date.now()}.webm`,
        });
        reader.readAsDataURL(blob);
      };
      recorder.start();
      setIsRecording(true);
    } catch (error) {
      toast.error(`Microfone indisponível: ${systemMessageError(error)}`);
    }
  }

  if (loading) return <main className="system-page grid min-h-screen place-items-center"><Loader2 className="size-8 animate-spin text-cyan-300" /></main>;
  if (!user) return <LoginScreen />;

  return (
    <main className="system-page min-h-screen text-zinc-100">
      <header className="system-header fixed inset-x-0 top-0 z-50 flex h-16 items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3"><Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}><Menu /></Button><SystemMark /></div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Badge className="system-badge hidden sm:flex"><CircleDot className="mr-1 size-3" />{settingsQuery.data?.activeModel ?? "NO_MODEL"}</Badge>
          <Badge className="system-badge hidden border-cyan-400/50 text-cyan-100 md:flex">{user.plan === "pro_max" ? "PRO MAX" : "BÁSICO"}</Badge>
          <Badge className="system-badge border-fuchsia-400/50 text-fuchsia-200">{user.role === "owner" ? "OWNER" : user.role === "admin" ? "ADMIN" : "GUEST"}</Badge>
          <Button variant="ghost" size="sm" className="font-mono text-xs text-zinc-300" onClick={logout}>SAIR</Button>
        </div>
      </header>

      {sidebarOpen && <button className="fixed inset-0 z-40 bg-black/75 lg:hidden" aria-label="Fechar navegação" onClick={() => setSidebarOpen(false)} />}
      <aside className={cn("system-sidebar fixed bottom-0 left-0 top-16 z-50 flex w-72 flex-col transition-transform lg:translate-x-0", sidebarOpen ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex items-center justify-between border-b border-white/10 p-4 lg:hidden"><span className="font-mono text-xs text-cyan-300">NAVIGATION</span><Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)}><X /></Button></div>
        <div className="p-4"><Button onClick={() => void createNewConversation()} disabled={createConversation.isPending} className="system-button h-10 w-full justify-start"><Plus className="mr-2 size-4" />NOVA CONVERSA</Button></div>
        <nav className="space-y-1 px-3">
          {NAVIGATION.map((item) => {
            const Icon = item.icon;
            return <button key={item.id} onClick={() => { setView(item.id); setSidebarOpen(false); }} className={cn("system-nav-item", view === item.id && "system-nav-item-active")}><Icon className="size-4" />{item.label}<span className="ml-auto font-mono text-[9px] opacity-45">0{NAVIGATION.indexOf(item) + 1}</span></button>;
          })}
          {user.role === "owner" && <button onClick={() => { setView("access"); setSidebarOpen(false); }} className={cn("system-nav-item", view === "access" && "system-nav-item-active")}><Users className="size-4" />Acessos<span className="ml-auto font-mono text-[9px] opacity-45">06</span></button>}
        </nav>
        <div className="mt-6 px-4"><p className="mb-2 font-mono text-[10px] tracking-[0.18em] text-zinc-500">HISTÓRICO PERSISTENTE</p><ScrollArea className="h-[calc(100vh-440px)] pr-2"><div className="space-y-1">{conversationsQuery.data?.map((conversation) => <button key={conversation.id} onClick={() => { setSelectedConversationId(conversation.id); setView("chat"); setSidebarOpen(false); }} className={cn("history-item", selectedConversationId === conversation.id && "history-item-active")}><MessageSquareText className="mt-0.5 size-3.5 shrink-0" /><span className="line-clamp-2 text-left">{conversation.title}</span></button>)}</div></ScrollArea></div>
        <div className="mt-auto border-t border-white/10 p-4"><p className="truncate font-mono text-xs text-zinc-400">{user.name || user.email || "Usuário"}</p><p className="mt-1 font-mono text-[10px] text-cyan-300/60">SESSION_AUTHENTICATED</p></div>
      </aside>

      <section className="pt-16 lg:pl-72">
        {view === "chat" && <ChatPanel
          messages={visibleMessages}
          isStreaming={isStreaming}
          selectedConversationId={selectedConversationId}
          onSend={sendMessage}
          onVoice={() => void toggleVoice()}
          isRecording={isRecording}
          voiceLoading={transcribeAudio.isPending}
          onImage={() => void handleImageRequest()}
          imageLoading={generateImage.isPending}
          onExport={exportConversation}
          onNewConversation={() => void createNewConversation()}
        />}
        {view === "tools" && <ToolsPanel />}
        {view === "config" && <ConfigPanel draft={draft} setDraft={setDraft} models={ollamaModels} allowedModels={settingsQuery.data?.allowedModels ?? []} connecting={false} onConnect={() => void connectOllama()} onSave={() => void saveSettings.mutateAsync(draft)} saving={saveSettings.isPending} isOwner={user.role === "owner"} isProMax={user.plan === "pro_max"} />}
        {view === "github" && <GitHubPanel configured={githubStatus.data?.configured ?? false} isOwner={user.role === "owner"} message={githubStatus.data?.message ?? "Verificando integração…"} />}
        {view === "desktop" && <DesktopPanel />}
        {view === "access" && user.role === "owner" && <><AccessPanel /><OwnerControls /></>}
      </section>
    </main>
  );
}

function PanelHeading({ code, title, description }: { code: string; title: string; description: string }) {
  return <div className="mb-6"><p className="font-mono text-[11px] tracking-[0.2em] text-fuchsia-300">[{code}]</p><h2 className="glitch-title mt-2 text-3xl font-black sm:text-4xl">{title}</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">{description}</p></div>;
}

function ChatPanel({ messages, isStreaming, selectedConversationId, onSend, onVoice, isRecording, voiceLoading, onImage, imageLoading, onExport, onNewConversation }: { messages: ChatMessage[]; isStreaming: boolean; selectedConversationId: number | null; onSend: (content: string) => void; onVoice: () => void; isRecording: boolean; voiceLoading: boolean; onImage: () => void; imageLoading: boolean; onExport: (format: "json" | "csv" | "text") => void; onNewConversation: () => void }) {
  return <div className="mx-auto max-w-[1600px] p-4 sm:p-6"><div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="font-mono text-[11px] tracking-[0.2em] text-cyan-300">[CHANNEL_01 // OLLAMA_STREAM]</p><h1 className="glitch-title mt-1 text-3xl font-black sm:text-4xl">CONVERSA ATIVA</h1></div><div className="flex gap-2"><Button variant="outline" size="sm" className="system-outline" disabled={!selectedConversationId} onClick={() => onExport("json")}>JSON</Button><Button variant="outline" size="sm" className="system-outline" disabled={!selectedConversationId} onClick={() => onExport("csv")}>CSV</Button><Button variant="outline" size="sm" className="system-outline" disabled={!selectedConversationId} onClick={() => onExport("text")}>TXT</Button></div></div>
    {!selectedConversationId ? <CommandDeck onNewConversation={onNewConversation} /> : <><AIChatBox messages={messages} onSendMessage={onSend} isLoading={isStreaming} height="calc(100vh - 270px)" placeholder="Envie uma instrução ao agente local…" emptyStateMessage="Canal pronto. Aguardando entrada do usuário." />
      <div className="mt-3 flex flex-wrap items-center gap-2"><Button onClick={onVoice} disabled={voiceLoading || isStreaming} variant="outline" className={cn("system-outline", isRecording && "border-fuchsia-400 text-fuchsia-200")}><Mic className={cn("mr-2 size-4", isRecording && "animate-pulse")} />{isRecording ? "PARAR GRAVAÇÃO" : voiceLoading ? "TRANSCRITANDO" : "VOZ"}</Button><Button onClick={onImage} disabled={imageLoading || isStreaming} variant="outline" className="system-outline"><ImagePlus className="mr-2 size-4" />{imageLoading ? "GERANDO" : "GERAR IMAGEM"}</Button><span className="ml-auto hidden font-mono text-[10px] tracking-[0.12em] text-zinc-500 sm:block">STREAM://LOCAL_ONLY</span></div></>}
  </div>;
}

function ConfigPanel({ draft, setDraft, models, allowedModels, onConnect, onSave, saving, isOwner, isProMax }: { draft: any; setDraft: (value: any) => void; models: string[]; allowedModels: string[]; connecting: boolean; onConnect: () => void; onSave: () => void; saving: boolean; isOwner: boolean; isProMax: boolean }) {
  const update = (key: string, value: string | boolean | number) => setDraft({ ...draft, [key]: value });
  return <div className="mx-auto max-w-5xl p-4 sm:p-8"><PanelHeading code="AGENT_CONFIG" title="NÚCLEO DO AGENTE" description={isProMax ? "Pro Max habilita a configuração ampliada de contexto e o acesso aos recursos liberados pelo owner." : "O plano Básico permite chat local e configuração essencial. O owner pode atribuir Pro Max para liberar recursos ampliados."} /><div className="system-card mb-5 p-4"><p className="font-mono text-[10px] tracking-[0.14em] text-cyan-300">[MODELOS AUTORIZADOS PARA ESTE PLANO]</p><div className="mt-3 flex flex-wrap gap-2">{allowedModels.map((model) => <Badge key={model} className="system-badge">{model}</Badge>)}</div></div>
    <div className="grid gap-5 lg:grid-cols-2"><section className="system-card p-5"><div className="mb-5 flex items-center justify-between"><h3 className="font-mono text-sm text-cyan-200">[OLLAMA_ENDPOINT]</h3><Button variant="outline" className="system-outline h-8" onClick={onConnect}><Radio className="mr-2 size-3.5" />VERIFICAR</Button></div><div className="space-y-4"><div><Label className="system-label">URL DO SERVIDOR OLLAMA</Label><Input className="system-input" value={draft.ollamaUrl} onChange={(e) => update("ollamaUrl", e.target.value)} /></div><div><Label className="system-label">MODELO ATIVO</Label><Input className="system-input" list="ollama-models" value={draft.activeModel} onChange={(e) => update("activeModel", e.target.value)} /><datalist id="ollama-models">{models.map((model) => <option value={model} key={model} />)}</datalist>{models.length > 0 && <p className="mt-2 font-mono text-[10px] text-cyan-300/70">{models.length} MODELOS DETECTADOS</p>}</div><div className="grid gap-4 sm:grid-cols-2"><div><Label className="system-label">TEMPERATURA / 100</Label><Input className="system-input" type="number" min={0} max={200} value={draft.temperature} onChange={(e) => update("temperature", Number(e.target.value))} /></div><div><Label className="system-label">TAMANHO DO CONTEXTO</Label><Input className="system-input" type="number" min={512} max={131072} value={draft.contextSize} onChange={(e) => update("contextSize", Number(e.target.value))} /></div></div></div></section>
      <section className="system-card p-5"><h3 className="font-mono text-sm text-fuchsia-200">[TOOL_PERMISSION_MATRIX]</h3><p className="mt-2 text-sm leading-6 text-zinc-400">Ative somente as fontes que deseja disponibilizar ao agente. As ferramentas consultam dados em tempo real quando chamadas.</p><div className="mt-5 divide-y divide-white/10">{([ ["weatherEnabled", "clima", CloudSun, false], ["newsEnabled", "notícias", Radio, true], ["currencyEnabled", "câmbio", TrendingUp, true] ] as const).map(([key, label, Icon, proOnly]) => <div className="flex items-center justify-between py-4" key={key}><div className="flex items-center gap-3"><Icon className="size-4 text-cyan-300" /><div><span className="font-mono text-sm">{label}</span>{proOnly && <p className="mt-1 text-[10px] text-fuchsia-300">PRO MAX</p>}</div></div><Switch disabled={proOnly && !isProMax} checked={draft[key]} onCheckedChange={(checked) => update(key, checked)} /></div>)}<div className="flex items-center justify-between py-4"><div><p className="font-mono text-sm">GitHub</p><p className="mt-1 text-xs text-zinc-500">Restrito ao owner e requer token configurado.</p></div><Switch disabled={!isOwner || !isProMax} checked={draft.githubEnabled} onCheckedChange={(checked) => update("githubEnabled", checked)} /></div></div></section>
    </div><section className="system-card mt-5 p-5"><Label className="system-label">PROMPT DE SISTEMA PERSONALIZÁVEL</Label><Textarea className="system-input mt-2 min-h-44" value={draft.systemPrompt} onChange={(e) => update("systemPrompt", e.target.value)} /><div className="mt-4 flex justify-end"><Button onClick={onSave} disabled={saving} className="system-button">{saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <CheckCircle2 className="mr-2 size-4" />}SALVAR CONFIGURAÇÃO</Button></div></section>
  </div>;
}

function ToolsPanel() {
  const utils = trpc.useUtils();
  const settingsQuery = trpc.agent.settings.useQuery();
  const catalogQuery = trpc.agent.apiCatalog.useQuery();
  const [weather, setWeather] = useState(""); const [news, setNews] = useState(""); const [base, setBase] = useState("USD"); const [quote, setQuote] = useState("BRL"); const [amount, setAmount] = useState("1"); const [result, setResult] = useState(""); const [loading, setLoading] = useState(false);
  async function execute(kind: "clima" | "notícias" | "câmbio") { setLoading(true); try { const response = kind === "clima" ? await utils.tools.clima.fetch({ local: weather }) : kind === "notícias" ? await utils.tools.notícias.fetch({ consulta: news }) : await utils.tools.câmbio.fetch({ base, destino: quote, valor: Number(amount) }); setResult(`${response.content}\n\nFonte: ${response.sourceUrl}`); } catch (error) { toast.error(systemMessageError(error)); } finally { setLoading(false); } }
  const isProMax = settingsQuery.data?.plan === "pro_max";
  const approvedCount = catalogQuery.data?.filter((api) => api.approvalStatus === "approved").length ?? 0;
  return <div className="mx-auto max-w-6xl p-4 sm:p-8"><PanelHeading code="AUTHORIZED_TOOLS" title="FERRAMENTAS EXTERNAS" description={isProMax ? "Pro Max permite as ferramentas ampliadas autorizadas pelo owner." : "O plano Básico tem acesso à ferramenta clima. Notícias e câmbio exigem Pro Max."} /><div className="mb-5 grid gap-3 sm:grid-cols-3"><StatusCell label="Catálogo" value={`${catalogQuery.data?.length ?? 0} fontes registradas`} /><StatusCell label="Aprovadas" value={`${approvedCount} fontes disponíveis`} /><StatusCell label="Expansão" value="aprovação do owner" /></div><div className="grid gap-5 lg:grid-cols-3"><ToolCard icon={CloudSun} title="clima" active={Boolean(settingsQuery.data?.weatherEnabled)}><Input className="system-input" placeholder="Ex.: São Paulo" value={weather} onChange={(e) => setWeather(e.target.value)} /><Button className="system-button mt-3 w-full" disabled={!weather || loading} onClick={() => void execute("clima")}>CONSULTAR CLIMA</Button></ToolCard><ToolCard icon={Radio} title="notícias" active={Boolean(settingsQuery.data?.newsEnabled) && isProMax}><Input className="system-input" placeholder="Tema ou acontecimento" value={news} onChange={(e) => setNews(e.target.value)} /><Button className="system-button mt-3 w-full" disabled={!news || loading || !isProMax} onClick={() => void execute("notícias")}>{isProMax ? "BUSCAR NOTÍCIAS" : "PRO MAX NECESSÁRIO"}</Button></ToolCard><ToolCard icon={TrendingUp} title="câmbio" active={Boolean(settingsQuery.data?.currencyEnabled) && isProMax}><div className="grid grid-cols-3 gap-2"><Input className="system-input" maxLength={3} value={base} onChange={(e) => setBase(e.target.value.toUpperCase())} /><Input className="system-input" maxLength={3} value={quote} onChange={(e) => setQuote(e.target.value.toUpperCase())} /><Input className="system-input" type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} /></div><Button className="system-button mt-3 w-full" disabled={!amount || loading || !isProMax} onClick={() => void execute("câmbio")}>{isProMax ? "CALCULAR CÂMBIO" : "PRO MAX NECESSÁRIO"}</Button></ToolCard></div><section className="system-card mt-5 min-h-56 p-5"><p className="font-mono text-xs tracking-[0.15em] text-fuchsia-300">[RESULT_OUTPUT]</p>{loading ? <Loader2 className="mt-10 animate-spin text-cyan-300" /> : <pre className="mt-5 whitespace-pre-wrap font-mono text-sm leading-6 text-zinc-300">{result || "Aguardando uma consulta autorizada."}</pre>}</section></div>;
}

function ToolCard({ icon: Icon, title, active, children }: { icon: typeof CloudSun; title: string; active: boolean; children: React.ReactNode }) { return <section className="system-card p-5"><div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2"><Icon className="size-5 text-cyan-300" /><h3 className="font-mono text-sm">{title}</h3></div><span className={cn("font-mono text-[10px]", active ? "text-cyan-300" : "text-zinc-600")}>{active ? "ON" : "OFF"}</span></div>{children}</section>; }

function GitHubPanel({ configured, isOwner, message }: { configured: boolean; isOwner: boolean; message: string }) { return <div className="mx-auto max-w-5xl p-4 sm:p-8"><PanelHeading code="GITHUB_GATEWAY" title="REPOSITÓRIOS & SITES" description="O agente pode analisar repositórios autorizados e preparar a estrutura de sites interativos. Operações externas dependem de autorização explícita do owner e de credencial configurada no servidor." /><section className="system-card p-6"><div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"><div className="flex gap-4"><div className="grid size-11 place-items-center border border-cyan-300/40 bg-cyan-300/10"><Code2 className="size-5 text-cyan-300" /></div><div><h3 className="font-mono text-base">STATUS DA INTEGRAÇÃO</h3><p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">{message}</p></div></div><Badge className={cn("system-badge", configured ? "border-cyan-300/60 text-cyan-100" : "border-zinc-600 text-zinc-400")}>{configured ? "READY" : "TOKEN_REQUIRED"}</Badge></div><div className="mt-7 grid gap-3 border-t border-white/10 pt-5 sm:grid-cols-3"><StatusCell label="Perfil" value={isOwner ? "owner" : "guest"} /><StatusCell label="Repositórios" value="autorizados" /><StatusCell label="Publicação" value="revisão antes de enviar" /></div><p className="mt-6 text-xs leading-5 text-zinc-500">A criação efetiva de repositórios ou publicação de código só deve ocorrer por uma ação confirmada do owner. Configure o token GitHub nas configurações seguras do projeto para habilitar as operações.</p></section></div>; }

function StatusCell({ label, value }: { label: string; value: string }) { return <div className="border border-white/10 bg-black/20 p-3"><p className="font-mono text-[10px] text-zinc-500">{label.toUpperCase()}</p><p className="mt-1 font-mono text-xs text-cyan-100">{value}</p></div>; }

function AccessPanel() {
  const utils = trpc.useUtils();
  const usersQuery = trpc.access.listUsers.useQuery();
  const updateAccess = trpc.access.updateUser.useMutation({ onSuccess: async () => { await utils.access.listUsers.invalidate(); toast.success("Acesso atualizado pelo owner."); }, onError: (error) => toast.error(systemMessageError(error)) });
  return <div className="mx-auto max-w-6xl p-4 sm:p-8"><PanelHeading code="OWNER_ACCESS_CONTROL" title="USUÁRIOS & PLANOS" description="Somente o owner pode promover administradores e atribuir os planos Básico ou Pro Max. Administradores ajudam na operação, mas não podem alterar o owner." /><section className="system-card overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left"><thead className="border-b border-white/10 bg-black/20 font-mono text-[10px] tracking-[0.12em] text-zinc-500"><tr><th className="px-5 py-4">USUÁRIO</th><th className="px-5 py-4">PAPEL</th><th className="px-5 py-4">PLANO</th><th className="px-5 py-4">ÚLTIMO ACESSO</th><th className="px-5 py-4"></th></tr></thead><tbody>{usersQuery.isLoading ? <tr><td colSpan={5} className="px-5 py-8"><Loader2 className="animate-spin text-cyan-300" /></td></tr> : usersQuery.data?.map((account) => <AccessRow key={account.id} account={account} saving={updateAccess.isPending} onSave={(role, plan) => void updateAccess.mutateAsync({ userId: account.id, role, plan })} />)}</tbody></table></div></section></div>;
}

function AccessRow({ account, saving, onSave }: { account: { id: number; name: string | null; email: string | null; role: "owner" | "admin" | "user"; plan: "basic" | "pro_max"; lastSignedIn: Date }; saving: boolean; onSave: (role: "admin" | "user", plan: "basic" | "pro_max") => void }) {
  const [role, setRole] = useState<"owner" | "admin" | "user">(account.role); const [plan, setPlan] = useState<"basic" | "pro_max">(account.plan); const isOwner = account.role === "owner";
  return <tr className="border-b border-white/5 last:border-0"><td className="px-5 py-4"><p className="text-sm text-zinc-200">{account.name || "Sem nome"}</p><p className="mt-1 font-mono text-[10px] text-zinc-500">{account.email || "sem e-mail"}</p></td><td className="px-5 py-4">{isOwner ? <Badge className="system-badge border-fuchsia-400/50 text-fuchsia-200">OWNER</Badge> : <select className="system-input mt-0 h-9 w-28" value={role} onChange={(e) => setRole(e.target.value as "admin" | "user")}><option value="user">GUEST</option><option value="admin">ADMIN</option></select>}</td><td className="px-5 py-4">{isOwner ? <Badge className="system-badge">PRO MAX</Badge> : <select className="system-input mt-0 h-9 w-32" value={plan} onChange={(e) => setPlan(e.target.value as "basic" | "pro_max")}><option value="basic">BÁSICO</option><option value="pro_max">PRO MAX</option></select>}</td><td className="px-5 py-4 font-mono text-xs text-zinc-500">{new Date(account.lastSignedIn).toLocaleString("pt-BR")}</td><td className="px-5 py-4">{!isOwner && <Button disabled={saving} size="sm" className="system-button h-8 px-3" onClick={() => onSave(role as "admin" | "user", plan)}>SALVAR</Button>}</td></tr>;
}

function LegacyOwnerControls() {
  const utils = trpc.useUtils();
  const catalogQuery = trpc.access.apiCatalog.useQuery();
  const modelsQuery = trpc.access.planModels.useQuery();
  const updateCatalog = trpc.access.updateApiCatalog.useMutation({
    onSuccess: async () => { await utils.access.apiCatalog.invalidate(); await utils.agent.apiCatalog.invalidate(); toast.success("API atualizada."); },
    onError: (error) => toast.error(systemMessageError(error)),
  });
  const updateModel = trpc.access.savePlanModel.useMutation({
    onSuccess: async () => { await utils.access.planModels.invalidate(); await utils.agent.settings.invalidate(); toast.success("Modelo por plano atualizado."); },
    onError: (error) => toast.error(systemMessageError(error)),
  });
  const addModel = (plan: "basic" | "pro_max") => {
    const modelName = window.prompt(`Nome do modelo Ollama para o plano ${plan === "basic" ? "Básico" : "Pro Max"}:`);
    if (modelName?.trim()) void updateModel.mutateAsync({ plan, modelName: modelName.trim(), isEnabled: true });
  };
  return <div className="mx-auto grid max-w-6xl gap-6 px-4 pb-8 sm:px-8 xl:grid-cols-2"><section className="system-card p-5"><div className="flex items-center justify-between gap-3"><h3 className="font-mono text-sm text-cyan-200">[MODELOS POR PLANO]</h3><div className="flex gap-2"><Button className="system-outline" size="sm" onClick={() => addModel("basic")}>+ BÁSICO</Button><Button className="system-outline" size="sm" onClick={() => addModel("pro_max")}>+ PRO MAX</Button></div></div><div className="mt-4 divide-y divide-white/10">{modelsQuery.data?.map((item) => <div className="flex items-center justify-between py-3" key={item.id}><div><p className="font-mono text-sm text-zinc-200">{item.modelName}</p><p className="mt-1 font-mono text-[10px] text-fuchsia-300">{item.plan === "basic" ? "BÁSICO" : "PRO MAX"}</p></div><Switch checked={Boolean(item.isEnabled)} onCheckedChange={(isEnabled) => void updateModel.mutateAsync({ plan: item.plan, modelName: item.modelName, isEnabled })} /></div>)}</div></section><section className="system-card p-5"><h3 className="font-mono text-sm text-cyan-200">[CATÁLOGO DE APIs]</h3><div className="mt-4 divide-y divide-white/10">{catalogQuery.data?.map((api) => <div className="flex items-center justify-between gap-4 py-3" key={api.id}><div className="min-w-0"><p className="truncate font-mono text-sm text-zinc-200">{api.name}</p><p className="mt-1 font-mono text-[10px] text-zinc-500">{api.category} // {api.minimumPlan === "basic" ? "BÁSICO" : "PRO MAX"}{api.credentialReference ? ` // ${api.credentialReference}` : ""}</p></div><Switch disabled={api.approvalStatus !== "approved"} checked={Boolean(api.isEnabled)} onCheckedChange={(isEnabled) => void updateCatalog.mutateAsync({ apiId: api.id, isEnabled, credentialReference: api.credentialReference })} /></div>)}</div></section></div>;
}

function OwnerControls() {
  const utils = trpc.useUtils();
  const catalogQuery = trpc.access.apiCatalog.useQuery();
  const modelsQuery = trpc.access.planModels.useQuery();
  const updateCatalog = trpc.access.updateApiCatalog.useMutation({
    onSuccess: async () => { await utils.access.apiCatalog.invalidate(); await utils.agent.apiCatalog.invalidate(); toast.success("API atualizada."); },
    onError: (error) => toast.error(systemMessageError(error)),
  });
  const updateModel = trpc.access.savePlanModel.useMutation({
    onSuccess: async () => { await utils.access.planModels.invalidate(); await utils.agent.settings.invalidate(); toast.success("Modelo por plano atualizado."); },
    onError: (error) => toast.error(systemMessageError(error)),
  });
  const addModel = (plan: "basic" | "pro_max") => {
    const modelName = window.prompt(`Nome do modelo Ollama para o plano ${plan === "basic" ? "Básico" : "Pro Max"}:`);
    if (modelName?.trim()) void updateModel.mutateAsync({ plan, modelName: modelName.trim(), isEnabled: true });
  };
  return <div className="mx-auto grid max-w-6xl gap-6 px-4 pb-8 sm:px-8 xl:grid-cols-2"><section className="system-card p-5"><div className="flex items-center justify-between gap-3"><h3 className="font-mono text-sm text-cyan-200">[MODELOS POR PLANO]</h3><div className="flex gap-2"><Button className="system-outline" size="sm" onClick={() => addModel("basic")}>+ BÁSICO</Button><Button className="system-outline" size="sm" onClick={() => addModel("pro_max")}>+ PRO MAX</Button></div></div><div className="mt-4 divide-y divide-white/10">{modelsQuery.data?.map((item) => <div className="flex items-center justify-between py-3" key={item.id}><div><p className="font-mono text-sm text-zinc-200">{item.modelName}</p><p className="mt-1 font-mono text-[10px] text-fuchsia-300">{item.plan === "basic" ? "BÁSICO" : "PRO MAX"}</p></div><Switch checked={Boolean(item.isEnabled)} onCheckedChange={(isEnabled) => void updateModel.mutateAsync({ plan: item.plan, modelName: item.modelName, isEnabled })} /></div>)}</div></section><section className="system-card p-5"><h3 className="font-mono text-sm text-cyan-200">[CATÁLOGO DE APIs]</h3><div className="mt-4 divide-y divide-white/10">{catalogQuery.data?.map((api) => <ApiCatalogRow key={api.id} api={api} saving={updateCatalog.isPending} onSave={(isEnabled, credentialReference) => void updateCatalog.mutateAsync({ apiId: api.id, isEnabled, credentialReference })} />)}</div></section></div>;
}

function ApiCatalogRow({ api, saving, onSave }: { api: { name: string; category: string; minimumPlan: "basic" | "pro_max"; approvalStatus: "catalog" | "approved" | "disabled"; isEnabled: number | null; credentialReference: string | null }; saving: boolean; onSave: (isEnabled: boolean, credentialReference: string | null) => void }) {
  const [enabled, setEnabled] = useState(Boolean(api.isEnabled));
  const [credentialReference, setCredentialReference] = useState(api.credentialReference ?? "");
  const canEnable = api.approvalStatus === "approved";
  return <div className="py-3"><div className="flex items-center justify-between gap-4"><div className="min-w-0"><p className="truncate font-mono text-sm text-zinc-200">{api.name}</p><p className="mt-1 font-mono text-[10px] text-zinc-500">{api.category} // {api.minimumPlan === "basic" ? "BÁSICO" : "PRO MAX"}</p></div><Switch disabled={!canEnable} checked={enabled} onCheckedChange={setEnabled} /></div><div className="mt-3 flex gap-2"><Input className="system-input mt-0 h-8" value={credentialReference} placeholder="Referência de credencial (opcional)" onChange={(event) => setCredentialReference(event.target.value)} /><Button size="sm" disabled={saving} className="system-outline h-8" onClick={() => onSave(enabled, credentialReference.trim() || null)}>SALVAR</Button></div>{!canEnable && <p className="mt-2 font-mono text-[10px] text-zinc-600">PENDENTE DE APROVAÇÃO</p>}</div>;
}

function DesktopPanel() { const platforms = [{ name: "Windows", command: "Instale o aplicativo Electron ou use o navegador Chromium/Edge e selecione “Instalar aplicativo”.", code: "winget install Ollama.Ollama" }, { name: "macOS", command: "Instale o aplicativo Electron ou abra no Safari/Chrome e adicione o aplicativo à área de trabalho.", code: "brew install --cask ollama" }, { name: "Linux", command: "Use o pacote Electron compatível com sua distribuição ou instale pelo navegador como PWA.", code: "curl -fsSL https://ollama.com/install.sh | sh" }]; return <div className="mx-auto max-w-5xl p-4 sm:p-8"><PanelHeading code="DESKTOP_INSTALL" title="NÓ LOCAL MULTIPLATAFORMA" description="O modo desktop compartilha a mesma interface da web e usa o Ollama instalado na própria máquina. A aplicação pode funcionar como Electron ou PWA instalável." /><div className="grid gap-5 md:grid-cols-3">{platforms.map((platform) => <section className="system-card p-5" key={platform.name}><Download className="size-6 text-fuchsia-300" /><h3 className="mt-4 font-mono text-lg text-cyan-100">{platform.name}</h3><p className="mt-3 text-sm leading-6 text-zinc-400">{platform.command}</p><pre className="mt-5 overflow-x-auto border border-white/10 bg-black/40 p-3 font-mono text-xs text-cyan-200">{platform.code}</pre></section>)}</div><section className="system-card mt-5 p-5"><p className="font-mono text-xs tracking-[0.16em] text-cyan-300">[INITIAL_SEQUENCE]</p><ol className="mt-4 space-y-3 text-sm leading-6 text-zinc-300"><li>01. Instale o Ollama no sistema operacional escolhido.</li><li>02. Baixe ao menos um modelo, por exemplo: <code className="text-fuchsia-200">ollama run llama3.2</code>.</li><li>03. Abra o aplicativo e mantenha a URL padrão <code className="text-fuchsia-200">http://localhost:11434</code> nas configurações.</li><li>04. Verifique a conexão e selecione o modelo local disponível.</li></ol></section></div>; }
