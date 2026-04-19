import React, { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '../components/TopBar.jsx'
import Icon from '../components/Icon.jsx'
import { useApp } from '../contexts/AppContext.jsx'
import { SURFACES } from '../data/players.js'
import { TOURNAMENTS, tournamentsOnDate } from '../data/tournaments.js'

const ROUNDS = [
  { id: 'R128', label: '1er tour (R128)' },
  { id: 'R64', label: '2e tour (R64)' },
  { id: 'R32', label: '3e tour (R32)' },
  { id: 'R16', label: '1/8 (R16)' },
  { id: 'QF', label: 'Quart de finale' },
  { id: 'SF', label: 'Demi-finale' },
  { id: 'F', label: 'Finale' },
  { id: 'Qualif', label: 'Qualifications' },
]

function lastName(full) {
  if (!full) return ''
  const parts = full.trim().split(/\s+/)
  return parts[parts.length - 1]
}

export default function AddBet() {
  const navigate = useNavigate()
  const { addBet, allPlayers, user } = useApp()

  const [mode, setMode] = useState('simple') // simple | combine | live

  const [matches, setMatches] = useState([
    { player1: '', player2: '', tournamentId: '', round: '', odd: '1.85', pick: 'ml_p1', customBet: '' },
  ])
  const [focusField, setFocusField] = useState(null)
  const [query, setQuery] = useState('')

  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)

  const [surface, setSurface] = useState('Hard')
  const [tour, setTour] = useState('ATP')

  const [stakeMode, setStakeMode] = useState('eur')
  const [stake, setStake] = useState(user?.strategy?.flatAmount ? String(user.strategy.flatAmount) : '10')
  const [stakePct, setStakePct] = useState(user?.strategy?.percentAmount ? String(user.strategy.percentAmount) : '2')
  const [status, setStatus] = useState('pending')

  const availableTournaments = useMemo(() => tournamentsOnDate(date), [date])

  useEffect(() => {
    if (mode === 'combine' && matches.length < 2) {
      setMatches([...matches, { player1: '', player2: '', tournamentId: '', round: '', odd: '1.85', pick: 'ml_p1', customBet: '' }])
    }
    if (mode !== 'combine' && matches.length > 1) {
      setMatches([matches[0]])
    }
  }, [mode])

  const updateMatch = (idx, patch) => {
    setMatches(prev => prev.map((m, i) => i === idx ? { ...m, ...patch } : m))
  }

  const addMatch = () => setMatches([...matches, { player1: '', player2: '', tournamentId: '', round: '', odd: '1.85', pick: 'ml_p1', customBet: '' }])
  const removeMatch = (idx) => setMatches(matches.filter((_, i) => i !== idx))

  // Auto-fill surface/tour from 1st match tournament
  useEffect(() => {
    const m0 = matches[0]
    if (!m0?.tournamentId) return
    const t = TOURNAMENTS.find(x => x.id === m0.tournamentId)
    if (!t) return
    setSurface(t.surface)
    if (t.tour === 'ATP') setTour('ATP')
    else if (t.tour === 'WTA') setTour('WTA')
  }, [matches[0]?.tournamentId])

  useEffect(() => {
    const name = matches[0]?.player1
    if (!name) return
    const p = allPlayers.find(x => x.name === name)
    if (p && p.tour && p.tour !== 'Mixte') setTour(p.tour)
  }, [matches[0]?.player1])

  const suggestions = useMemo(() => {
    if (!focusField || !query) return []
    const q = query.toLowerCase()
    return allPlayers.filter(p => p.name.toLowerCase().includes(q)).slice(0, 6)
  }, [allPlayers, query, focusField])

  const pickPlayer = (name) => {
    if (!focusField) return
    updateMatch(focusField.matchIdx, { [focusField.field]: name })
    setQuery('')
    setFocusField(null)
  }

  const addCustomPlayer = () => {
    const name = query.trim()
    if (!name || !focusField) return
    updateMatch(focusField.matchIdx, { [focusField.field]: name })
    setQuery('')
    setFocusField(null)
  }

  const combinedOdd = useMemo(() => {
    if (mode !== 'combine') return Number(matches[0]?.odd || 1)
    return matches.reduce((acc, m) => acc * (Number(m.odd) || 1), 1)
  }, [matches, mode])

  const effectiveStake = useMemo(() => {
    if (stakeMode === 'pct') {
      const br = user?.bankrollStart || 500
      return +(br * (Number(stakePct) || 0) / 100).toFixed(2)
    }
    return Number(stake) || 0
  }, [stake, stakePct, stakeMode, user])

  const potentialGain = useMemo(() => {
    return +(effectiveStake * (combinedOdd - 1)).toFixed(2)
  }, [effectiveStake, combinedOdd])

  // Joueur 2 obligatoire
  const canSubmit =
    matches.every(m =>
      m.player1?.trim() &&
      m.player2?.trim() &&
      Number(m.odd) > 1 &&
      (m.pick !== 'custom' || m.customBet?.trim())
    ) &&
    effectiveStake > 0

  const submit = () => {
    if (!canSubmit) return

    const buildBetTypeInfo = (m) => {
      if (m.pick === 'ml_p1') return { betType: 'ml_p1', customBetLabel: null }
      if (m.pick === 'ml_p2') return { betType: 'ml_p2', customBetLabel: null }
      return { betType: 'custom', customBetLabel: m.customBet.trim() }
    }

    if (mode === 'combine') {
      const allPlayersInCombo = matches.flatMap(m => [m.player1, m.player2].filter(Boolean))
      const firstTournament = matches[0].tournamentId
      addBet({
        players: allPlayersInCombo,
        tournamentId: firstTournament || null,
        surface, tour,
        betType: 'combine',
        stake: effectiveStake,
        stakeMode, stakePct: stakeMode === 'pct' ? Number(stakePct) : null,
        odd: combinedOdd,
        date: new Date(date + 'T12:00:00').toISOString(),
        status,
        mode: 'combine',
        matches: matches.map(m => ({
          players: [m.player1, m.player2].filter(Boolean),
          tournamentId: m.tournamentId,
          round: m.round,
          odd: Number(m.odd),
          ...buildBetTypeInfo(m),
        })),
      })
    } else {
      const m = matches[0]
      const info = buildBetTypeInfo(m)
      addBet({
        players: [m.player1, m.player2].filter(Boolean),
        tournamentId: m.tournamentId || null,
        round: m.round || null,
        surface, tour,
        betType: mode === 'live' ? 'live' : info.betType,
        customBetLabel: info.customBetLabel,
        stake: effectiveStake,
        stakeMode, stakePct: stakeMode === 'pct' ? Number(stakePct) : null,
        odd: Number(m.odd),
        date: new Date(date + 'T12:00:00').toISOString(),
        status,
        mode,
      })
    }
    navigate('/')
  }

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="Ajouter un pari" showBack />

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 pt-2" style={{ paddingBottom: 120 }}>
        <div className="segmented mb-5">
          {[
            { id: 'simple', label: 'Simple' },
            { id: 'combine', label: 'Combiné' },
            { id: 'live', label: 'Live' },
          ].map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`seg-btn ${mode === m.id ? 'active' : ''}`}
              style={mode === m.id && m.id === 'live' ? { background: 'var(--loss-500)' } : {}}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Date — pleine largeur forcée */}
        <section className="mb-5">
          <label className="field-label">Date du match</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{ width: '100%', display: 'block', boxSizing: 'border-box', maxWidth: '100%' }}
          />
        </section>

        {matches.map((match, idx) => (
          <MatchBlock
            key={idx}
            idx={idx}
            match={match}
            mode={mode}
            showRemove={mode === 'combine' && matches.length > 2}
            availableTournaments={availableTournaments}
            onUpdate={(patch) => updateMatch(idx, patch)}
            onRemove={() => removeMatch(idx)}
            focusField={focusField}
            setFocusField={setFocusField}
            query={query}
            setQuery={setQuery}
            suggestions={suggestions}
            pickPlayer={pickPlayer}
            addCustomPlayer={addCustomPlayer}
          />
        ))}

        {mode === 'combine' && (
          <button onClick={addMatch} className="btn-ghost w-full mb-5">
            <Icon name="add" size={16} color="white" />
            Ajouter un match au combiné
          </button>
        )}

        {/* Circuit + Surface */}
        <section className="mb-5 grid grid-cols-2 gap-2">
          <div>
            <label className="field-label">Circuit</label>
            <select value={tour} onChange={(e) => setTour(e.target.value)}>
              <option value="ATP">ATP</option>
              <option value="WTA">WTA</option>
            </select>
          </div>
          <div>
            <label className="field-label">Surface</label>
            <select value={surface} onChange={(e) => setSurface(e.target.value)}>
              {SURFACES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
        </section>

        {/* Mise & cote */}
        <section className="mb-5">
          <div className="segmented mb-3" style={{ fontSize: 12 }}>
            <button onClick={() => setStakeMode('eur')} className={`seg-btn ${stakeMode === 'eur' ? 'active' : ''}`} style={{ padding: '10px' }}>€</button>
            <button onClick={() => setStakeMode('pct')} className={`seg-btn ${stakeMode === 'pct' ? 'active' : ''}`} style={{ padding: '10px' }}>%</button>
          </div>
          <label className="field-label">
            {stakeMode === 'eur' ? `Mise (${user?.currency || '€'})` : 'Mise (% de bankroll)'}
          </label>
          {stakeMode === 'eur' ? (
            <input type="number" inputMode="decimal" placeholder="10" value={stake} onChange={(e) => setStake(e.target.value)} />
          ) : (
            <input type="number" inputMode="decimal" step="0.1" placeholder="2" value={stakePct} onChange={(e) => setStakePct(e.target.value)} />
          )}
          {stakeMode === 'pct' && (
            <div className="caption mt-2">Mise effective : <b>{effectiveStake.toFixed(2)} {user?.currency || '€'}</b></div>
          )}
          {mode === 'combine' && (
            <div className="caption mt-2">Cote combinée : <b style={{ color: 'var(--blue-500)' }}>{combinedOdd.toFixed(2)}</b></div>
          )}
        </section>

        <section className="mb-5">
          <label className="field-label">Statut</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="pending">En cours</option>
            <option value="won">Gagné</option>
            <option value="lost">Perdu</option>
            <option value="void">Remboursé</option>
          </select>
        </section>

        {canSubmit && (
          <div className="card p-4 mb-4" style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.1), rgba(34,197,94,0.02))', borderColor: 'rgba(34,197,94,0.3)' }}>
            <div className="flex items-center justify-between">
              <div>
                <div className="field-label" style={{ marginBottom: 2 }}>Gain potentiel</div>
                <div className="stat-value text-win" style={{ fontSize: 24 }}>+{potentialGain.toFixed(2)} {user?.currency || '€'}</div>
              </div>
              <div className="text-right caption">
                <div>Mise : {effectiveStake.toFixed(2)} {user?.currency || '€'}</div>
                <div>Cote : {combinedOdd.toFixed(2)}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div
        className="fixed left-0 right-0 px-5 py-3 safe-bottom"
        style={{ bottom: 0, background: 'var(--ink-900)', borderTop: '1px solid var(--ink-600)', zIndex: 50 }}
      >
        <button onClick={submit} disabled={!canSubmit} className="btn-primary">
          Enregistrer le pari
        </button>
      </div>
    </div>
  )
}

function MatchBlock({ idx, match, mode, showRemove, availableTournaments, onUpdate, onRemove, focusField, setFocusField, query, setQuery, suggestions, pickPlayer, addCustomPlayer }) {
  const isFocused = (field) => focusField?.matchIdx === idx && focusField?.field === field
  const p1Last = lastName(match.player1)
  const p2Last = lastName(match.player2)

  return (
    <section className="card mb-4" style={{ padding: 14 }}>
      {mode === 'combine' && (
        <div className="flex items-center justify-between mb-3">
          <span className="field-label" style={{ marginBottom: 0, color: 'var(--blue-500)' }}>Match {idx + 1}</span>
          {showRemove && (
            <button onClick={onRemove} className="w-7 h-7 flex items-center justify-center" style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
              <Icon name="clear" size={16} color="muted" />
            </button>
          )}
        </div>
      )}

      <div className="space-y-2">
        <div className="relative">
          <input
            type="text"
            placeholder="Joueur 1"
            value={isFocused('player1') ? query : match.player1}
            onFocus={() => { setFocusField({ matchIdx: idx, field: 'player1' }); setQuery(match.player1) }}
            onBlur={() => setTimeout(() => setFocusField(null), 200)}
            onChange={(e) => setQuery(e.target.value)}
          />
          {isFocused('player1') && query && (
            <SuggestionList suggestions={suggestions} query={query} onPick={pickPlayer} onAddCustom={addCustomPlayer} />
          )}
        </div>
        <div className="text-center micro text-fg-3" style={{ fontStyle: 'italic', fontWeight: 700, padding: '2px 0' }}>vs</div>
        <div className="relative">
          <input
            type="text"
            placeholder="Joueur 2 (requis)"
            value={isFocused('player2') ? query : match.player2}
            onFocus={() => { setFocusField({ matchIdx: idx, field: 'player2' }); setQuery(match.player2) }}
            onBlur={() => setTimeout(() => setFocusField(null), 200)}
            onChange={(e) => setQuery(e.target.value)}
          />
          {isFocused('player2') && query && (
            <SuggestionList suggestions={suggestions} query={query} onPick={pickPlayer} onAddCustom={addCustomPlayer} />
          )}
        </div>
      </div>

      <div className="mt-3">
        <label className="field-label">
          Tournoi {availableTournaments.length > 0 ? `· ${availableTournaments.length} actif${availableTournaments.length > 1 ? 's' : ''}` : '· aucun à cette date'}
        </label>
        <select value={match.tournamentId} onChange={(e) => onUpdate({ tournamentId: e.target.value })}>
          <option value="">Sélectionner un tournoi</option>
          {availableTournaments.length === 0 && (
            <optgroup label="Tous les tournois">
              {TOURNAMENTS.map(t => (
                <option key={t.id} value={t.id}>{t.name} — {t.category}</option>
              ))}
            </optgroup>
          )}
          {availableTournaments.length > 0 && availableTournaments.map(t => (
            <option key={t.id} value={t.id}>{t.name} — {t.category}</option>
          ))}
        </select>
        {match.tournamentId && (
          <div className="caption mt-1">
            {(() => {
              const t = TOURNAMENTS.find(x => x.id === match.tournamentId)
              return t ? `${t.category} · ${t.surface} · ${t.dates}` : ''
            })()}
          </div>
        )}
      </div>

      <div className="mt-3">
        <label className="field-label">Tour du tournoi</label>
        <select value={match.round} onChange={(e) => onUpdate({ round: e.target.value })}>
          <option value="">—</option>
          {ROUNDS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </div>

      {/* PICK simplifié : ML P1 / ML P2 / Personnaliser */}
      <div className="mt-3">
        <label className="field-label">Sur qui tu paries ?</label>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <button
            onClick={() => onUpdate({ pick: 'ml_p1' })}
            className="card"
            style={{
              padding: '12px 10px', textAlign: 'center', cursor: 'pointer',
              borderColor: match.pick === 'ml_p1' ? 'var(--blue-500)' : 'var(--ink-600)',
              borderWidth: match.pick === 'ml_p1' ? 1.5 : 1,
              boxShadow: match.pick === 'ml_p1' ? 'var(--glow-blue-soft)' : 'none',
              background: match.pick === 'ml_p1' ? 'rgba(41,98,255,0.08)' : 'transparent',
            }}
          >
            <div className="micro text-fg-3" style={{ letterSpacing: '0.08em', fontWeight: 700 }}>ML</div>
            <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2, color: match.pick === 'ml_p1' ? 'var(--blue-500)' : 'var(--fg-1)' }}>
              {p1Last || 'Joueur 1'}
            </div>
          </button>
          <button
            onClick={() => onUpdate({ pick: 'ml_p2' })}
            className="card"
            style={{
              padding: '12px 10px', textAlign: 'center', cursor: 'pointer',
              borderColor: match.pick === 'ml_p2' ? 'var(--blue-500)' : 'var(--ink-600)',
              borderWidth: match.pick === 'ml_p2' ? 1.5 : 1,
              boxShadow: match.pick === 'ml_p2' ? 'var(--glow-blue-soft)' : 'none',
              background: match.pick === 'ml_p2' ? 'rgba(41,98,255,0.08)' : 'transparent',
            }}
          >
            <div className="micro text-fg-3" style={{ letterSpacing: '0.08em', fontWeight: 700 }}>ML</div>
            <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2, color: match.pick === 'ml_p2' ? 'var(--blue-500)' : 'var(--fg-1)' }}>
              {p2Last || 'Joueur 2'}
            </div>
          </button>
        </div>
        <button
          onClick={() => onUpdate({ pick: 'custom' })}
          className="btn-ghost w-full"
          style={{
            borderColor: match.pick === 'custom' ? 'var(--blue-500)' : 'var(--ink-600)',
            color: match.pick === 'custom' ? 'var(--blue-500)' : 'var(--fg-1)',
            fontSize: 12, padding: '10px', fontWeight: 600,
          }}
        >
          {match.pick === 'custom' ? '✓ Pari personnalisé' : '+ Personnaliser (set, jeux, handicap…)'}
        </button>
        {match.pick === 'custom' && (
          <input
            type="text"
            placeholder="Ex: Alcaraz gagne 2-0, Total jeux > 22.5…"
            value={match.customBet}
            onChange={(e) => onUpdate({ customBet: e.target.value })}
            className="mt-2"
            style={{ fontSize: 13 }}
          />
        )}
      </div>

      <div className="mt-3">
        <label className="field-label">Cote</label>
        <input
          type="number" inputMode="decimal" step="0.01"
          placeholder="1.85" value={match.odd}
          onChange={(e) => onUpdate({ odd: e.target.value })}
        />
      </div>
    </section>
  )
}

function SuggestionList({ suggestions, query, onPick, onAddCustom }) {
  return (
    <div
      className="absolute top-full left-0 right-0 z-20 mt-1 card overflow-hidden"
      style={{ maxHeight: 256, overflowY: 'auto' }}
    >
      {suggestions.map(s => (
        <button
          key={s.id}
          onMouseDown={(e) => { e.preventDefault(); onPick(s.name) }}
          className="w-full flex items-center gap-2 p-3 text-left"
          style={{ background: 'transparent', border: 'none', borderBottom: '1px solid var(--ink-600)', cursor: 'pointer' }}
        >
          <span style={{ fontSize: 18 }}>{s.flag || '🌍'}</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate">{s.name}</div>
            <div className="micro text-fg-3">{s.tour}{s.rank ? ` · #${s.rank}` : ''}{s.custom ? ' · perso' : ''}</div>
          </div>
        </button>
      ))}
      {!suggestions.some(s => s.name.toLowerCase() === query.toLowerCase()) && query.trim() && (
        <button
          onMouseDown={(e) => { e.preventDefault(); onAddCustom() }}
          className="w-full flex items-center gap-2 p-3 text-left"
          style={{ background: 'rgba(41,98,255,0.08)', border: 'none', cursor: 'pointer' }}
        >
          <Icon name="add" size={18} color="blue" />
          <span className="text-sm font-semibold" style={{ color: 'var(--blue-500)' }}>Ajouter « {query} » comme nouveau joueur</span>
        </button>
      )}
    </div>
  )
}
