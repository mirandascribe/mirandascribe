import { useState, useRef, useEffect, useCallback } from 'react'
import { TEMPLATES } from '../lib/prompts'

// ─── REPORT RENDERER ──────────────────────────────────────────────────────────
function ReportDisplay({ report, queries }) {
  const lines = report.split('\n')
  const MAIN = /^(INDICATION|TECHNIQUE|FINDINGS|CONCLUSION|IMPRESSION)$/
  const SUB  = /^([A-Z][A-Z\s\/\-]{2,}):\s*(.*)/
  const ASMP = /^\[ASSUMPTION:/
  const NUM  = /^\d+\./

  return (
    <div style={{ fontFamily: 'var(--mono)', fontSize: 12.5, lineHeight: 1.85 }}>
      {lines.map((line, i) => {
        const t = line.trim()
        if (!t) return <div key={i} style={{ height: 8 }} />
        if (ASMP.test(t)) return (
          <div key={i} style={{ background: 'var(--warn-light)', border: '1.5px solid rgba(217,119,6,0.3)', borderRadius: 7, padding: '9px 13px', marginBottom: 12, fontSize: 11, color: 'var(--warn)', fontWeight: 600 }}>{t}</div>
        )
        if (MAIN.test(t)) return (
          <div key={i} style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2.5, color: 'var(--accent)', marginTop: 22, marginBottom: 8, paddingBottom: 7, borderBottom: '2px solid var(--accent-light)', textTransform: 'uppercase' }}>{t}</div>
        )
        const sub = t.match(SUB)
        if (sub) return (
          <div key={i} style={{ marginTop: 10, marginBottom: 2 }}>
            <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: 11 }}>{sub[1]}:</span>
            <span style={{ color: 'var(--text-mid)' }}> {sub[2]}</span>
          </div>
        )
        if (NUM.test(t)) return (
          <div key={i} style={{ color: 'var(--text)', fontWeight: 600, marginBottom: 4 }}>{t}</div>
        )
        return <div key={i} style={{ color: 'var(--text-mid)' }}>{t}</div>
      })}

      {queries.length > 0 && (
        <div style={{ marginTop: 24, paddingTop: 16, borderTop: '2px solid rgba(217,119,6,0.2)' }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2, color: 'var(--warn)', marginBottom: 12, textTransform: 'uppercase' }}>
            Queries Requiring Response
          </div>
          {queries.map((q, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 13px', background: 'var(--warn-light)', border: '1.5px solid rgba(217,119,6,0.2)', borderRadius: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--warn)', background: 'rgba(217,119,6,0.12)', padding: '3px 8px', borderRadius: 4, whiteSpace: 'nowrap', flexShrink: 0, marginTop: 1, textTransform: 'uppercase', letterSpacing: 1 }}>Q{i + 1}</span>
              <span style={{ fontSize: 12, color: 'var(--text-mid)', lineHeight: 1.7 }}>{q}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function Home() {
  // Theme
  const [dark, setDark] = useState(false)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  // Modality + template
  const [modality, setModality] = useState('MRI')
  const [template, setTemplate] = useState('MRI Knee')

  // Recording state
  const [isRecording, setIsRecording] = useState(false)
  const [recordSecs, setRecordSecs] = useState(0)
  const [waveHeights, setWaveHeights] = useState(Array(52).fill(3))
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const timerRef = useRef(null)
  const waveRef = useRef(null)

  // Pipeline state
  const [status, setStatus] = useState('idle') // idle | recording | transcribing | formatting | queries | done | error
  const [statusMsg, setStatusMsg] = useState('')
  const [pipelineStep, setPipelineStep] = useState(0)

  // Content
  const [transcript, setTranscript] = useState('')
  const [report, setReport] = useState('')
  const [queries, setQueries] = useState([])
  const [queryAnswers, setQueryAnswers] = useState('')

  // Session history
  const [sessions, setSessions] = useState([])
  const [activeSession, setActiveSession] = useState(null)

  // Prefs
  const [preferences, setPreferences] = useState([])
  const [newPref, setNewPref] = useState('')
  const [styleProfile, setStyleProfile] = useState('')
  const [showPrefs, setShowPrefs] = useState(false)

  // UI
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState('report') // report | history | prefs

  // Load saved prefs on mount
  useEffect(() => {
    try {
      const p = localStorage.getItem('ms_prefs')
      const s = localStorage.getItem('ms_style')
      const sess = localStorage.getItem('ms_sessions')
      if (p) setPreferences(JSON.parse(p))
      if (s) setStyleProfile(s)
      if (sess) {
        const parsed = JSON.parse(sess).filter(s => s.expires > Date.now())
        setSessions(parsed)
      }
    } catch (e) {}
  }, [])

  // ── RECORDING ──────────────────────────────────────────────────────────────
  const startWave = () => {
    waveRef.current = setInterval(() => {
      setWaveHeights(Array(52).fill(0).map(() => Math.random() * 38 + 4))
    }, 80)
  }
  const stopWave = () => {
    clearInterval(waveRef.current)
    setWaveHeights(Array(52).fill(3))
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioChunksRef.current = []
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      mr.onstop = handleRecordingStop
      mr.start(100)
      mediaRecorderRef.current = mr
      setIsRecording(true)
      setStatus('recording')
      setStatusMsg('Listening — speak now')
      setTranscript('')
      setReport('')
      setQueries([])
      setPipelineStep(0)

      // Timer
      setRecordSecs(0)
      timerRef.current = setInterval(() => setRecordSecs(s => s + 1), 1000)
      startWave()
    } catch (err) {
      setStatus('error')
      setStatusMsg('Microphone access denied — please allow microphone in Chrome and try again')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop())
      setIsRecording(false)
      clearInterval(timerRef.current)
      stopWave()
      setStatus('transcribing')
      setStatusMsg('Transcribing with Whisper...')
      setPipelineStep(1)
    }
  }

  const handleRecordingStop = async () => {
    const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
    const fd = new FormData()
    fd.append('audio', blob, 'dictation.webm')

    try {
      const res = await fetch('/api/transcribe', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Transcription failed')
      setTranscript(data.text)
      await formatReport(data.text)
    } catch (err) {
      setStatus('error')
      setStatusMsg('Transcription error: ' + err.message)
    }
  }

  // ── FORMAT REPORT ──────────────────────────────────────────────────────────
  const formatReport = useCallback(async (transcriptText, isFollowUp = false, followUpData = null) => {
    setStatus('formatting')
    setStatusMsg('Claude is formatting your report...')
    setPipelineStep(isFollowUp ? 3 : 2)

    try {
      const body = isFollowUp
        ? {
            followUp: true,
            transcript: transcriptText,
            originalReport: followUpData.originalReport,
            queries: followUpData.queries,
            queryAnswers: followUpData.queryAnswers,
            preferences,
            styleProfile,
          }
        : {
            transcript: transcriptText,
            preferences,
            styleProfile,
          }

      const res = await fetch('/api/format', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Formatting failed')

      setReport(data.report)
      setQueries(data.queries || [])
      setPipelineStep(4)

      if (data.hasQueries) {
        setStatus('queries')
        setStatusMsg(`${data.queries.length} ${data.queries.length === 1 ? 'query' : 'queries'} — please answer below then reformat`)
      } else {
        setStatus('done')
        setStatusMsg('Report complete — ready to copy into RIS')
        autoSave(data.report)
      }
    } catch (err) {
      setStatus('error')
      setStatusMsg('Formatting error: ' + err.message)
    }
  }, [preferences, styleProfile])

  const submitQueryAnswers = async () => {
    if (!queryAnswers.trim()) return
    setQueryAnswers('')
    await formatReport(transcript, true, {
      originalReport: report,
      queries,
      queryAnswers,
    })
  }

  // ── SESSION HISTORY ────────────────────────────────────────────────────────
  const autoSave = (reportText) => {
    const session = {
      id: Date.now(),
      label: template || 'Report',
      report: reportText,
      transcript,
      created: new Date().toISOString(),
      expires: Date.now() + 24 * 60 * 60 * 1000,
    }
    setSessions(prev => {
      const updated = [session, ...prev.filter(s => s.expires > Date.now())].slice(0, 20)
      try { localStorage.setItem('ms_sessions', JSON.stringify(updated)) } catch (e) {}
      return updated
    })
  }

  const loadSession = (session) => {
    setReport(session.report)
    setTranscript(session.transcript || '')
    setQueries([])
    setStatus('done')
    setStatusMsg('Session loaded')
    setPipelineStep(4)
    setActiveSession(session.id)
    setActiveTab('report')
  }

  const deleteSession = (id) => {
    setSessions(prev => {
      const updated = prev.filter(s => s.id !== id)
      try { localStorage.setItem('ms_sessions', JSON.stringify(updated)) } catch (e) {}
      return updated
    })
    if (activeSession === id) setActiveSession(null)
  }

  // ── PREFS ──────────────────────────────────────────────────────────────────
  const savePref = () => {
    if (!newPref.trim()) return
    const updated = [...preferences, newPref.trim()]
    setPreferences(updated)
    setNewPref('')
    try { localStorage.setItem('ms_prefs', JSON.stringify(updated)) } catch (e) {}
  }

  const removePref = (i) => {
    const updated = preferences.filter((_, j) => j !== i)
    setPreferences(updated)
    try { localStorage.setItem('ms_prefs', JSON.stringify(updated)) } catch (e) {}
  }

  const saveStyle = () => {
    try { localStorage.setItem('ms_style', styleProfile) } catch (e) {}
    setShowPrefs(false)
    setStatusMsg('Style profile saved')
  }

  // ── COPY ───────────────────────────────────────────────────────────────────
  const copyReport = () => {
    navigator.clipboard.writeText(report.replace(/\n{3,}/g, '\n\n').trim())
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500) })
  }

  const clearAll = () => {
    setReport(''); setTranscript(''); setQueries(''); setQueryAnswers('')
    setStatus('idle'); setStatusMsg(''); setPipelineStep(0); setActiveSession(null)
  }

  // ── HELPERS ────────────────────────────────────────────────────────────────
  const fmtTime = s => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`

  const statusStyle = {
    idle:         { bg: 'var(--surface2)', color: 'var(--text-dim)',  border: 'var(--border)' },
    recording:    { bg: 'var(--danger-light)', color: 'var(--danger)', border: 'rgba(220,38,38,0.2)' },
    transcribing: { bg: 'var(--accent-light)', color: 'var(--accent)', border: 'rgba(26,110,245,0.2)' },
    formatting:   { bg: 'var(--accent-light)', color: 'var(--accent)', border: 'rgba(26,110,245,0.2)' },
    queries:      { bg: 'var(--warn-light)',   color: 'var(--warn)',   border: 'rgba(217,119,6,0.2)' },
    done:         { bg: 'var(--teal-light)',   color: 'var(--teal)',   border: 'rgba(13,148,136,0.2)' },
    error:        { bg: 'var(--danger-light)', color: 'var(--danger)', border: 'rgba(220,38,38,0.2)' },
  }[status] || { bg: 'var(--surface2)', color: 'var(--text-dim)', border: 'var(--border)' }

  const pipelineSteps = ['Transcribe', 'Format', 'Query', 'Done']

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* ── HEADER ── */}
      <header style={{
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        padding: '0 24px', height: 58, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', flexShrink: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        position: 'relative', zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 24, color: 'var(--accent)', fontWeight: 700, letterSpacing: -0.5 }}>
            Miranda Scribe
          </span>
          <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: 2, textTransform: 'uppercase' }}>
            AI Radiology Dictation
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Status pill */}
          {statusMsg && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 13px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: statusStyle.bg, color: statusStyle.color, border: `1px solid ${statusStyle.border}`, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {(status === 'transcribing' || status === 'formatting') && (
                <span style={{ width: 10, height: 10, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite', opacity: 0.6, flexShrink: 0 }} />
              )}
              {status === 'recording' && (
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--danger)', display: 'inline-block', animation: 'pulse 1s infinite', flexShrink: 0 }} />
              )}
              {statusMsg}
            </div>
          )}
          <button onClick={() => setDark(d => !d)} style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--surface2)', border: '1.5px solid var(--border)', color: 'var(--text-mid)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {dark ? '☀' : '🌙'}
          </button>
        </div>
      </header>

      {/* ── BODY ── */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '220px 1fr 400px', overflow: 'hidden', minHeight: 0 }}>

        {/* ── LEFT SIDEBAR ── */}
        <div style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Modality tabs */}
          <div style={{ padding: '14px 12px 10px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 10 }}>Modality</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
              {['MRI', 'CT', 'US', 'XR'].map(m => (
                <button key={m} onClick={() => { setModality(m); setTemplate(TEMPLATES[m][0].name) }}
                  style={{ padding: '9px 4px', borderRadius: 8, border: '1.5px solid', borderColor: modality === m ? 'var(--accent)' : 'var(--border)', background: modality === m ? 'var(--accent)' : 'var(--surface2)', color: modality === m ? '#fff' : 'var(--text-mid)', fontSize: 12, fontWeight: 700, transition: 'all 0.15s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                  <span style={{ fontSize: 18 }}>{m === 'MRI' ? '🧲' : m === 'CT' ? '⚙️' : m === 'US' ? '📡' : '🩻'}</span>
                  {m === 'US' ? 'Ultrasound' : m === 'XR' ? 'X-Ray' : m}
                </button>
              ))}
            </div>
          </div>

          {/* Template list */}
          <div style={{ flex: 1, overflow: 'auto', padding: '8px 8px' }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: 'var(--text-dim)', textTransform: 'uppercase', padding: '6px 6px 8px' }}>Templates</div>
            {(TEMPLATES[modality] || []).map(t => (
              <button key={t.name} onClick={() => setTemplate(t.name)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 8, border: '1.5px solid', borderColor: template === t.name ? 'rgba(26,110,245,0.25)' : 'transparent', background: template === t.name ? 'var(--accent-light)' : 'transparent', color: template === t.name ? 'var(--accent)' : 'var(--text-mid)', fontSize: 12, fontWeight: 500, textAlign: 'left', transition: 'all 0.12s', marginBottom: 2 }}>
                <span style={{ fontSize: 15, flexShrink: 0 }}>{t.icon}</span>
                <span style={{ lineHeight: 1.3 }}>{t.name.replace(/^(MRI|CT|Ultrasound|X-Ray) /, '')}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── CENTER: DICTATION ── */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>

          {/* Record zone */}
          <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '22px 24px 18px', flexShrink: 0, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 22, color: 'var(--text)', marginBottom: 4 }}>
                  Dictation Studio
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.7, marginBottom: 12 }}>
                  Press record, speak naturally — include modality, anatomy, side and findings.<br />
                  Miranda Scribe detects the template and formats your report automatically.
                </div>
                {/* Current template badge */}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: 'var(--accent-light)', border: '1px solid rgba(26,110,245,0.2)', borderRadius: 20, fontSize: 11, fontWeight: 600, color: 'var(--accent)' }}>
                  {(TEMPLATES[modality] || []).find(t => t.name === template)?.icon} {template}
                </div>
              </div>

              {/* RECORD BUTTON */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={status === 'transcribing' || status === 'formatting'}
                  style={{
                    width: 88, height: 88, borderRadius: '50%',
                    background: isRecording ? 'var(--danger)' : 'var(--surface)',
                    border: `3px solid ${isRecording ? 'var(--danger)' : 'var(--danger)'}`,
                    color: isRecording ? '#fff' : 'var(--danger)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 2, transition: 'all 0.2s',
                    animation: isRecording ? 'recordPulse 1.2s infinite' : 'none',
                    boxShadow: isRecording ? '' : '0 4px 18px rgba(220,38,38,0.15)',
                    opacity: (status === 'transcribing' || status === 'formatting') ? 0.5 : 1,
                    cursor: (status === 'transcribing' || status === 'formatting') ? 'not-allowed' : 'pointer',
                  }}>
                  <span style={{ fontSize: 28, lineHeight: 1 }}>{isRecording ? '⏹' : '🎙'}</span>
                  <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase' }}>{isRecording ? 'Stop' : 'Record'}</span>
                </button>
                {isRecording && (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--danger)', fontWeight: 600 }}>
                    {fmtTime(recordSecs)}
                  </div>
                )}
              </div>
            </div>

            {/* WAVEFORM */}
            <div style={{ marginTop: 14, height: 50, background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 10, display: 'flex', alignItems: 'center', padding: '0 14px', gap: 2, overflow: 'hidden', position: 'relative' }}>
              {isRecording ? (
                waveHeights.map((h, i) => (
                  <div key={i} style={{ width: 3, height: h, background: 'var(--accent)', borderRadius: 2, opacity: 0.7, flexShrink: 0, transition: 'height 0.08s ease' }} />
                ))
              ) : (
                <span style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', fontSize: 11, color: 'var(--text-dim)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                  {status === 'transcribing' ? '⚡ Transcribing with Whisper...' : status === 'formatting' ? '⚡ Claude is formatting your report...' : 'Waveform appears during recording'}
                </span>
              )}
            </div>
          </div>

          {/* Transcript area */}
          <div style={{ flex: 1, overflow: 'auto', padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {!transcript ? (
              <div style={{ textAlign: 'center', padding: '52px 20px', color: 'var(--text-dim)', animation: 'slideUp 0.4s ease' }}>
                <div style={{ fontSize: 48, opacity: 0.15, marginBottom: 14 }}>🎙</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-mid)', marginBottom: 8 }}>Ready to dictate</div>
                <div style={{ fontSize: 12, lineHeight: 2 }}>
                  Press the record button and speak naturally.<br />
                  Include modality, anatomy, side and findings.<br />
                  Miranda Scribe handles the rest automatically.
                </div>
              </div>
            ) : (
              <div style={{ animation: 'slideUp 0.3s ease' }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  Raw Transcript
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                </div>
                <textarea
                  value={transcript}
                  onChange={e => setTranscript(e.target.value)}
                  style={{ width: '100%', minHeight: 120, padding: 14, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 10, fontFamily: 'var(--mono)', fontSize: 12.5, lineHeight: 1.85, color: 'var(--text)', outline: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
                  onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />
                {(status === 'idle' || status === 'error' || status === 'done') && transcript && (
                  <button onClick={() => formatReport(transcript)}
                    style={{ marginTop: 10, width: '100%', padding: '13px', background: 'var(--accent)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, boxShadow: '0 4px 14px rgba(26,110,245,0.3)', transition: 'all 0.2s' }}>
                    ✦ Re-format Report
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div style={{ background: 'var(--surface)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Tab bar */}
          <div style={{ padding: '0 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 2, height: 48, flexShrink: 0 }}>
            {[['report', 'Report'], ['history', `History (${sessions.length})`], ['prefs', 'Preferences']].map(([id, label]) => (
              <button key={id} onClick={() => setActiveTab(id)}
                style={{ padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, border: '1.5px solid', borderColor: activeTab === id ? 'rgba(26,110,245,0.2)' : 'transparent', background: activeTab === id ? 'var(--accent-light)' : 'transparent', color: activeTab === id ? 'var(--accent)' : 'var(--text-dim)', transition: 'all 0.12s' }}>
                {label}
              </button>
            ))}
          </div>

          {/* Pipeline bar */}
          {pipelineStep > 0 && activeTab === 'report' && (
            <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              {pipelineSteps.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', fontSize: 8, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', background: i + 1 < pipelineStep ? 'var(--teal)' : i + 1 === pipelineStep ? 'var(--accent)' : 'var(--border)', color: i + 1 <= pipelineStep ? '#fff' : 'var(--text-dim)', animation: i + 1 === pipelineStep ? 'spin 1s linear infinite' : 'none' }}>
                      {i + 1 < pipelineStep ? '✓' : i + 1}
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 600, color: i + 1 < pipelineStep ? 'var(--teal)' : i + 1 === pipelineStep ? 'var(--accent)' : 'var(--text-dim)' }}>{s}</span>
                  </div>
                  {i < pipelineSteps.length - 1 && <div style={{ flex: 1, height: 2, background: i + 1 < pipelineStep ? 'var(--teal)' : 'var(--border)', margin: '0 4px', maxWidth: 22 }} />}
                </div>
              ))}
            </div>
          )}

          {/* ── REPORT TAB ── */}
          {activeTab === 'report' && (
            <>
              <div style={{ flex: 1, overflow: 'auto', padding: '18px 18px' }}>
                {!report ? (
                  <div style={{ textAlign: 'center', padding: '56px 16px', color: 'var(--text-dim)' }}>
                    <div style={{ fontSize: 52, opacity: 0.1, marginBottom: 14 }}>📋</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-mid)', marginBottom: 8 }}>Report appears here</div>
                    <div style={{ fontSize: 12, lineHeight: 2 }}>Dictate using the microphone.<br />The formatted report will appear here<br />ready to copy into RIS.</div>
                  </div>
                ) : (
                  <div style={{ animation: 'slideUp 0.3s ease' }}>
                    <ReportDisplay report={report} queries={queries} />
                  </div>
                )}
              </div>

              {/* Query answer zone */}
              {status === 'queries' && queries.length > 0 && (
                <div style={{ margin: '0 14px 12px', padding: '14px', background: 'var(--warn-light)', border: '2px solid rgba(217,119,6,0.2)', borderRadius: 10, flexShrink: 0, animation: 'slideUp 0.3s ease' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--warn)', marginBottom: 10 }}>
                    ⚠ Answer the {queries.length === 1 ? 'query' : `${queries.length} queries`} above, then click Reformat
                  </div>
                  <textarea
                    value={queryAnswers}
                    onChange={e => setQueryAnswers(e.target.value)}
                    placeholder="Address each query in order, e.g. Q1: ACL is intact. Q2: No synovitis seen."
                    style={{ width: '100%', padding: '10px 12px', background: 'var(--surface)', border: '1.5px solid rgba(217,119,6,0.3)', borderRadius: 8, fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text)', outline: 'none', minHeight: 72, boxSizing: 'border-box' }}
                  />
                  <button onClick={submitQueryAnswers}
                    style={{ width: '100%', marginTop: 8, padding: 11, background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, boxShadow: '0 3px 10px rgba(26,110,245,0.25)' }}>
                    Reformat with answers →
                  </button>
                </div>
              )}

              {/* Action buttons */}
              {report && (
                <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button onClick={copyReport}
                    style={{ flex: 1, padding: '11px', borderRadius: 9, fontSize: 13, fontWeight: 700, background: copied ? 'var(--teal)' : 'var(--accent)', border: 'none', color: '#fff', boxShadow: `0 3px 10px ${copied ? 'rgba(13,148,136,0.25)' : 'rgba(26,110,245,0.25)'}`, transition: 'all 0.2s' }}>
                    {copied ? '✓ Copied!' : '📋 Copy — RIS Ready'}
                  </button>
                  <button onClick={clearAll}
                    style={{ padding: '11px 14px', borderRadius: 9, fontSize: 12, fontWeight: 600, background: 'var(--surface2)', border: '1.5px solid var(--border)', color: 'var(--text-dim)' }}>
                    Clear
                  </button>
                </div>
              )}
            </>
          )}

          {/* ── HISTORY TAB ── */}
          {activeTab === 'history' && (
            <div style={{ flex: 1, overflow: 'auto', padding: '14px' }}>
              {sessions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-dim)' }}>
                  <div style={{ fontSize: 40, opacity: 0.15, marginBottom: 12 }}>🕐</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-mid)', marginBottom: 6 }}>No sessions yet</div>
                  <div style={{ fontSize: 12, lineHeight: 1.8 }}>Completed reports are saved here<br />automatically for 24 hours.</div>
                </div>
              ) : sessions.map(s => {
                const hrs = Math.round((s.expires - Date.now()) / 3600000)
                const active = activeSession === s.id
                return (
                  <div key={s.id} style={{ padding: '12px 13px', border: '1.5px solid', borderColor: active ? 'rgba(26,110,245,0.3)' : 'var(--border)', borderRadius: 9, marginBottom: 8, background: active ? 'var(--accent-light)' : 'var(--surface)', cursor: 'pointer', transition: 'all 0.12s' }}
                    onClick={() => loadSession(s)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: active ? 'var(--accent)' : 'var(--text)' }}>{s.label}</span>
                      <button onClick={e => { e.stopPropagation(); deleteSession(s.id) }}
                        style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 14, cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-dim)' }}>
                      <span>{new Date(s.created).toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' })}</span>
                      <span style={{ color: hrs < 3 ? 'var(--danger)' : 'var(--text-dim)', fontWeight: 600 }}>Expires {hrs}h</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── PREFERENCES TAB ── */}
          {activeTab === 'prefs' && (
            <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 12 }}>Personal Preferences</div>
              <div style={{ display: 'flex', gap: 7, marginBottom: 10 }}>
                <input value={newPref} onChange={e => setNewPref(e.target.value)}
                  placeholder='e.g. Always state bone age in paediatric reports'
                  onKeyDown={e => e.key === 'Enter' && savePref()}
                  style={{ flex: 1, padding: '9px 12px', background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 12, outline: 'none' }} />
                <button onClick={savePref}
                  style={{ padding: '9px 14px', background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 700 }}>Add</button>
              </div>
              <div style={{ marginBottom: 18 }}>
                {preferences.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '4px 0' }}>No preferences added yet.</div>
                  : preferences.map((p, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'var(--accent-light)', border: '1px solid rgba(26,110,245,0.15)', borderRadius: 20, fontSize: 12, color: 'var(--accent)', fontWeight: 500, marginBottom: 6 }}>
                      <span style={{ flex: 1 }}>{p}</span>
                      <span onClick={() => removePref(i)} style={{ cursor: 'pointer', color: 'var(--text-dim)', fontSize: 15, lineHeight: 1 }}>×</span>
                    </div>
                  ))}
              </div>

              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 10, paddingTop: 14, borderTop: '1px solid var(--border)' }}>Style Profile</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.7, marginBottom: 10 }}>Paste 3–10 of your past reports. Miranda Scribe will match your writing style and terminology.</div>
              <textarea value={styleProfile} onChange={e => setStyleProfile(e.target.value)}
                placeholder="Paste past reports from your RIS system here..."
                style={{ width: '100%', minHeight: 140, padding: 12, background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 9, fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--text)', outline: 'none', marginBottom: 10 }} />
              <button onClick={saveStyle}
                style={{ width: '100%', padding: '10px', background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700 }}>
                Save Style Profile
              </button>

              <div style={{ marginTop: 20, padding: '12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 9, fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.8 }}>
                <strong style={{ color: 'var(--text-mid)' }}>Baked-in rules (always applied):</strong><br />
                Plain ASCII only · NZ English · No smart quotes · No em dashes ·
                No "degenerative" in conclusions · Grade 1-4 chondral damage ·
                ACL full documentation · Ultrasound lipoma wording · No bursopathy
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
