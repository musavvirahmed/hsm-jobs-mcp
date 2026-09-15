import { addPropertyControls, ControlType, useIsStaticRenderer } from "framer"
import { startTransition, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react"

interface TUIAskProps {
    intro: string
    searchUrl: string
}

interface OpeningCard {
    title: string
    url: string
    location: string
    sponsor: string
    kvk: string
}

interface AskResult {
    kind: "openings" | "status" | "blocked"
    note: string
    openings?: OpeningCard[]
    truncated?: boolean
}

interface TranscriptItem {
    id: string
    role: "user" | "assistant"
    text?: string
    result?: AskResult
}

interface ParsedAsk {
    kind: "search" | "status"
    query?: string
    location?: string
    kvk?: string
}

const CYAN = "#00d7d7"
const PAPER = "#e6e6e6"
const MUTED = "#6c6c6c"
const BLACK = "#000000"
const CODE = "#141414"
const MONO = 'ui-monospace, "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace'

/** Half the prior cadence (~2 chars / 36ms) — still streams, easier to read. */
const STREAM_CHARS_PER_TICK = 2
const STREAM_TICK_MS = 36

const EXAMPLE_ASKS = [
    "Which recognised sponsors are hiring product designers?",
    "Which recognised sponsors are hiring software engineers in Amsterdam?",
    "What Openings do you have for KvK 60733144?",
    "How fresh is the jobs index?",
] as const

const DEMO_DESIGNERS: OpeningCard[] = [
    {
        title: "Lead Product Designer (YouTrack)",
        url: "https://job-boards.eu.greenhouse.io/jetbrains/jobs/4907838101",
        location: "Amsterdam, Netherlands (and other cities)",
        sponsor: "JetBrains N.V.",
        kvk: "56460279",
    },
    {
        title: "Product Designer",
        url: "https://jobs.ashbyhq.com/rentman/86561042-c8f9-4a2c-9d93-c51ba421e6e7",
        location: "Utrecht",
        sponsor: "Rentman B.V.",
        kvk: "60733144",
    },
    {
        title: "Product Designer",
        url: "https://jobs.ashbyhq.com/crisp/5e91e26d-2977-4164-b793-ebe94b84a141",
        location: "Amsterdam",
        sponsor: "Crisp",
        kvk: "71482288",
    },
]

const DEMO_ENGINEERS: OpeningCard[] = [
    {
        title: "C++ Software Engineer",
        url: "https://job-boards.eu.greenhouse.io/imc/jobs/4634204101",
        location: "Amsterdam, Netherlands",
        sponsor: "IMC Trading B.V.",
        kvk: "33223419",
    },
    {
        title: "Experienced Software Engineer - Trading Development",
        url: "https://webbtraders.recruitee.com/o/experienced-software-engineer-trading-development",
        location: "Amsterdam, Noord-Holland, Netherlands",
        sponsor: "WEBB Traders B.V.",
        kvk: "37156109",
    },
    {
        title: "Full-Stack Software Engineer",
        url: "https://werkenbijbudgetthuis.nl/o/full-stack-software-engineer",
        location: "Amsterdam, Noord-Holland, Nederland",
        sponsor: "Nuts Groep",
        kvk: "54036682",
    },
    {
        title: "Internship: Software Engineer",
        url: "https://jobs.seenons.com/o/internship-software-engineer",
        location: "Amsterdam, Noord-Holland, Nederland",
        sponsor: "Seenons B.V.",
        kvk: "76467244",
    },
]

const DEMO_KVK: OpeningCard[] = [
    {
        title: "Design System Designer",
        url: "https://jobs.ashbyhq.com/rentman/03bfc6ad-250a-4642-a787-c3d3358c613b",
        location: "Utrecht",
        sponsor: "Rentman B.V.",
        kvk: "60733144",
    },
    {
        title: "Product Designer",
        url: "https://jobs.ashbyhq.com/rentman/86561042-c8f9-4a2c-9d93-c51ba421e6e7",
        location: "Utrecht",
        sponsor: "Rentman B.V.",
        kvk: "60733144",
    },
    {
        title: "AI Engineer Trainee",
        url: "https://jobs.ashbyhq.com/rentman/e45861b5-e143-4b44-b26e-d8602e6450a5",
        location: "Utrecht",
        sponsor: "Rentman B.V.",
        kvk: "60733144",
    },
]

const STATUS_NOTE =
    "Jobs index is not stale. last_successful_crawl 2026-09-15T09:58:14.666Z. 10163 openings · 409 sponsors with openings · register_size 12980 (register as of 2026-09-03) · pass full_careers_pass. These counts are a snapshot copied from get_index_status — this page cannot call MCP from the browser yet."

const SEARCH_NOTE =
    "Full Work-register coverage (register as of 2026-09-03). Showing the top matches — more exist. Try a tighter title or location to narrow the list. Sponsor matches look current."

function parseAsk(raw: string): ParsedAsk {
    const text = raw.trim()
    if (/how fresh|index status|jobs index/i.test(text) && !/\bhiring\b/i.test(text)) {
        return { kind: "status" }
    }
    const kvkMatch = text.match(/\b(\d{8})\b/)
    if (kvkMatch) return { kind: "search", kvk: kvkMatch[1] }
    const inMatch = text.match(/\bin\s+([^?]+?)\s*\??$/i)
    let location: string | undefined
    let rest = text.replace(/\?+$/, "")
    if (inMatch && inMatch.index !== undefined) {
        location = inMatch[1].trim()
        rest = text.slice(0, inMatch.index).trim()
    }
    const query = rest
        .replace(/^which (?:recognised )?sponsors are hiring\s+/i, "")
        .replace(/^what openings do you have for\s+/i, "")
        .replace(/\?+$/, "")
        .trim()
    return { kind: "search", query: query || rest, location }
}

function demoResult(parsed: ParsedAsk): AskResult | null {
    if (parsed.kind === "status") {
        return { kind: "status", note: STATUS_NOTE }
    }
    if (parsed.kvk === "60733144") {
        return { kind: "openings", note: SEARCH_NOTE, openings: DEMO_KVK, truncated: true }
    }
    const q = (parsed.query || "").toLowerCase()
    const loc = (parsed.location || "").toLowerCase()
    if (q.includes("software engineer") && loc.includes("amsterdam")) {
        return { kind: "openings", note: SEARCH_NOTE, openings: DEMO_ENGINEERS, truncated: true }
    }
    if (q.includes("product designer")) {
        return { kind: "openings", note: SEARCH_NOTE, openings: DEMO_DESIGNERS, truncated: true }
    }
    return null
}

function describeAsk(parsed: ParsedAsk): string {
    if (parsed.kvk) return `KvK ${parsed.kvk}`
    const parts = [parsed.query, parsed.location ? `in ${parsed.location}` : ""].filter(Boolean)
    return parts.join(" ") || "that"
}

function blockedResult(parsed: ParsedAsk): AskResult {
    const what = describeAsk(parsed)
    return {
        kind: "blocked",
        note: `This preview only has a few sample answers ready, and none match “${what}” yet. Try one of the example questions above — or connect hsm-jobs in Claude Code or GitHub Copilot to search live openings at recognised sponsors.`,
    }
}

function newId(): string {
    return Math.random().toString(36).slice(2, 10)
}

function box(extra?: CSSProperties): CSSProperties {
    return {
        boxSizing: "border-box",
        fontFamily: MONO,
        ...extra,
    }
}

/**
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight any-prefer-fixed
 */
export default function TUIAsk(props: TUIAskProps) {
    const intro =
        props.intro ||
        "Ask which recognised sponsors are hiring. You do not need an AI harness or MCP tools — type a question."
    const isStatic = useIsStaticRenderer()
    const inputRef = useRef<HTMLInputElement>(null)
    const scrollRef = useRef<HTMLDivElement>(null)
    const [draft, setDraft] = useState("")
    const [pending, setPending] = useState(false)
    const [items, setItems] = useState<TranscriptItem[]>([])

    useEffect(() => {
        if (isStatic) return
        if (typeof window === "undefined") return
        inputRef.current?.focus()
    }, [isStatic])

    useEffect(() => {
        const el = scrollRef.current
        if (!el) return
        el.scrollTop = el.scrollHeight
    }, [items, pending])

    async function run(text: string) {
        const trimmed = text.trim()
        if (!trimmed || pending) return
        const parsed = parseAsk(trimmed)
        const userItem: TranscriptItem = { id: newId(), role: "user", text: trimmed }
        startTransition(() => {
            setItems((current) => [...current, userItem])
            setDraft("")
            setPending(true)
        })

        let result = demoResult(parsed)
        const endpoint = props.searchUrl?.trim()
        if (!result && endpoint && typeof window !== "undefined") {
            try {
                const response = await fetch(endpoint, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify(parsed),
                })
                if (response.ok) {
                    const payload = (await response.json()) as AskResult
                    result = payload
                }
            } catch {
                result = null
            }
        }
        const finalResult = result ?? blockedResult(parsed)
        startTransition(() => {
            setItems((current) => [
                ...current,
                { id: newId(), role: "assistant", result: finalResult },
            ])
        })
        // pending stays true until the typewriter finishes (see ResultBlock onDone)
    }

    function onSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        void run(draft)
    }

    function scrollTranscript() {
        const el = scrollRef.current
        if (el) el.scrollTop = el.scrollHeight
    }

    return (
        <div
            style={box({
                position: "relative",
                display: "flex",
                flexDirection: "column",
                width: "100%",
                height: "100%",
                minHeight: 520,
                background: BLACK,
                color: PAPER,
                fontSize: 13,
                lineHeight: 1.55,
            })}
        >
            <style>{`@keyframes tuiask-caret { 50% { opacity: 0; } }`}</style>
            <div
                ref={scrollRef}
                style={{
                    flex: 1,
                    overflow: "auto",
                    padding: "16px 14px 8px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 14,
                }}
            >
                <p style={{ margin: 0, color: MUTED }}>{intro}</p>
                {items.map((item, index) =>
                    item.role === "user" ? (
                        <p key={item.id} style={{ margin: 0, color: CYAN }}>
                            <span style={{ color: MUTED }}>{"> "}</span>
                            {item.text}
                        </p>
                    ) : (
                        <ResultBlock
                            key={item.id}
                            result={item.result}
                            instant={isStatic || index < items.length - 1}
                            onDone={
                                index === items.length - 1
                                    ? () => startTransition(() => setPending(false))
                                    : undefined
                            }
                            onTick={scrollTranscript}
                        />
                    )
                )}
                {pending && items[items.length - 1]?.role === "user" ? (
                    <p style={{ margin: 0, color: MUTED }}>searching the jobs index…</p>
                ) : null}
                {items.length === 0 && !pending ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <p style={{ margin: 0, color: MUTED }}>Try an example:</p>
                        {EXAMPLE_ASKS.map((ask) => (
                            <button
                                key={ask}
                                type="button"
                                disabled={isStatic}
                                onClick={() => void run(ask)}
                                style={box({
                                    textAlign: "left",
                                    background: "transparent",
                                    color: CYAN,
                                    border: "none",
                                    padding: 0,
                                    cursor: isStatic ? "default" : "pointer",
                                    fontSize: 13,
                                    lineHeight: 1.5,
                                })}
                            >
                                {`“${ask}”`}
                            </button>
                        ))}
                    </div>
                ) : null}
            </div>
            <form
                onSubmit={onSubmit}
                style={box({
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 12px",
                    borderTop: `1px solid ${CYAN}`,
                    background: CODE,
                })}
            >
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flex: "1 1 220px",
                        minWidth: 0,
                    }}
                >
                    <span style={{ color: CYAN }}>{">"}</span>
                    <input
                        ref={inputRef}
                        value={draft}
                        disabled={isStatic || pending}
                        onChange={(event) => setDraft(event.target.value)}
                        placeholder="Which recognised sponsors are hiring software engineers in Amsterdam?"
                        aria-label="Ask which recognised sponsors are hiring"
                        style={box({
                            flex: 1,
                            minWidth: 0,
                            border: "none",
                            outline: "none",
                            background: "transparent",
                            color: PAPER,
                            fontSize: 13,
                        })}
                    />
                </div>
                <button
                    type="submit"
                    disabled={isStatic || pending || draft.trim().length === 0}
                    style={box({
                        border: `1px solid ${CYAN}`,
                        background: BLACK,
                        color: CYAN,
                        padding: "6px 12px",
                        cursor: "pointer",
                        fontSize: 12,
                    })}
                >
                    ask
                </button>
            </form>
        </div>
    )
}

function ResultBlock({
    result,
    instant,
    onDone,
    onTick,
}: {
    result?: AskResult
    instant?: boolean
    onDone?: () => void
    onTick?: () => void
}) {
    const note = result?.note ?? ""
    const [visibleChars, setVisibleChars] = useState(instant ? note.length : 0)
    const [showTable, setShowTable] = useState(Boolean(instant))
    const doneRef = useRef(false)
    const onDoneRef = useRef(onDone)
    const onTickRef = useRef(onTick)
    onDoneRef.current = onDone
    onTickRef.current = onTick

    useEffect(() => {
        if (!result) return

        if (instant) {
            setVisibleChars(result.note.length)
            setShowTable(true)
            if (!doneRef.current) {
                doneRef.current = true
                onDoneRef.current?.()
            }
            return
        }

        doneRef.current = false
        setVisibleChars(0)
        setShowTable(false)

        if (typeof window === "undefined") return

        let cancelled = false
        let shown = 0
        const full = result.note

        const timer = window.setInterval(() => {
            if (cancelled) return
            shown = Math.min(full.length, shown + STREAM_CHARS_PER_TICK)
            setVisibleChars(shown)
            onTickRef.current?.()
            if (shown >= full.length) {
                window.clearInterval(timer)
                setShowTable(true)
                if (!doneRef.current) {
                    doneRef.current = true
                    onDoneRef.current?.()
                }
            }
        }, STREAM_TICK_MS)

        return () => {
            cancelled = true
            window.clearInterval(timer)
        }
    }, [result, instant])

    if (!result) return null

    const streaming = !instant && visibleChars < result.note.length
    const noteSlice = result.note.slice(0, visibleChars)

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ margin: 0, color: PAPER, whiteSpace: "pre-wrap" }}>
                {noteSlice}
                {streaming ? (
                    <span
                        aria-hidden
                        style={{
                            display: "inline-block",
                            width: "0.55em",
                            marginLeft: 1,
                            borderBottom: `2px solid ${CYAN}`,
                            verticalAlign: "baseline",
                            animation: "tuiask-caret 1s steps(1) infinite",
                        }}
                    >
                        {"\u00a0"}
                    </span>
                ) : null}
            </p>
            {showTable && result.openings && result.openings.length > 0 ? (
                <OpeningsTable openings={result.openings} />
            ) : null}
        </div>
    )
}

/** Monospace columns matching how Claude Code / Copilot usually format search_jobs cards. */
function OpeningsTable({ openings }: { openings: OpeningCard[] }) {
    const cols = {
        title: Math.min(36, Math.max(18, ...openings.map((o) => o.title.length), 5)),
        sponsor: Math.min(22, Math.max(12, ...openings.map((o) => o.sponsor.length), 7)),
        kvk: 8,
        location: Math.min(28, Math.max(12, ...openings.map((o) => o.location.length), 8)),
    }

    function pad(text: string, width: number): string {
        const clipped = text.length > width ? `${text.slice(0, Math.max(1, width - 1))}…` : text
        return clipped.padEnd(width, " ")
    }

    const header = `${pad("Title", cols.title)}  ${pad("Sponsor", cols.sponsor)}  ${pad("KvK", cols.kvk)}  ${pad("Location", cols.location)}`
    const rule = `${"─".repeat(cols.title)}  ${"─".repeat(cols.sponsor)}  ${"─".repeat(cols.kvk)}  ${"─".repeat(cols.location)}`

    return (
        <div
            style={box({
                overflowX: "auto",
                color: PAPER,
                fontSize: 12,
                lineHeight: 1.45,
            })}
        >
            <pre style={{ margin: 0, fontFamily: MONO, color: MUTED }}>{`${header}\n${rule}`}</pre>
            {openings.map((opening) => (
                <div
                    key={opening.url}
                    style={{
                        display: "flex",
                        flexWrap: "nowrap",
                        whiteSpace: "pre",
                        fontFamily: MONO,
                        fontSize: 12,
                        lineHeight: 1.45,
                    }}
                >
                    <a
                        href={opening.url}
                        target="_blank"
                        rel="noreferrer"
                        title={opening.title}
                        style={{
                            color: CYAN,
                            textDecoration: "none",
                            fontFamily: MONO,
                        }}
                    >
                        {pad(opening.title, cols.title)}
                    </a>
                    <span style={{ color: PAPER }}>{`  ${pad(opening.sponsor, cols.sponsor)}  ${pad(opening.kvk, cols.kvk)}  `}</span>
                    <span style={{ color: MUTED }} title={opening.location}>
                        {pad(opening.location, cols.location)}
                    </span>
                </div>
            ))}
        </div>
    )
}

addPropertyControls(TUIAsk, {
    intro: {
        type: ControlType.String,
        title: "Intro",
        displayTextArea: true,
        defaultValue:
            "Ask which recognised sponsors are hiring. You do not need an AI harness or MCP tools — type a question.",
    },
    searchUrl: {
        type: ControlType.String,
        title: "Search URL",
        defaultValue: "",
    },
})

