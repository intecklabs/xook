import { useMemo, useState } from 'react'
import { buildQuiz } from '../lib/quiz'
import { useStore } from '../store'
import type { Token } from '../lib/types'

interface Props {
  tokens: Token[]
  from: number
  to: number
  wpm: number
  onClose: () => void
}

export default function Quiz({ tokens, from, to, wpm, onClose }: Props): React.JSX.Element {
  const questions = useMemo(() => buildQuiz(tokens, from, to), [tokens, from, to])
  const [answers, setAnswers] = useState<(number | null)[]>(() => questions.map(() => null))
  const [done, setDone] = useState(false)

  const score = answers.filter((a, i) => a === questions[i].answer).length
  const pct = questions.length ? Math.round((score / questions.length) * 100) : 0

  const finish = (): void => {
    setDone(true)
    const sessionId = useStore.getState().lastSessionId
    if (sessionId) void window.api.setQuizScore(sessionId, pct)
  }

  const advice = (): string => {
    if (pct >= 75)
      return `Excelente comprensión a ${wpm} ppm. Prueba subir 25-50 ppm en la próxima sesión.`
    if (pct >= 50) return `Comprensión aceptable. Mantén ${wpm} ppm una sesión más antes de subir.`
    return `Comprensión baja. Baja la velocidad ~50 ppm o reduce el tamaño de bloque.`
  }

  return (
    <div className="overlay">
      <div className="overlay-card quiz">
        <h2>Sesión guardada: {wpm} ppm</h2>
        {questions.length === 0 ? (
          <>
            <p className="muted">No hay suficiente texto para armar un quiz de esta sesión.</p>
            <button className="primary" onClick={onClose}>
              Cerrar
            </button>
          </>
        ) : !done ? (
          <>
            <p className="muted small">Completa la palabra que faltaba en lo que acabas de leer.</p>
            {questions.map((q, qi) => (
              <div key={qi} className="q">
                <p>{q.sentence}</p>
                <div className="q-opts">
                  {q.options.map((o, oi) => (
                    <button
                      key={oi}
                      className={answers[qi] === oi ? 'active' : ''}
                      onClick={() => setAnswers((a) => a.map((v, i) => (i === qi ? oi : v)))}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className="row-end">
              <button className="ghost" onClick={onClose}>
                Saltar
              </button>
              <button
                className="primary"
                disabled={answers.some((a) => a === null)}
                onClick={finish}
              >
                Ver resultado
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="score">
              {score}/{questions.length} · {pct}%
            </div>
            <p>{advice()}</p>
            {questions.map((q, qi) =>
              answers[qi] !== q.answer ? (
                <p key={qi} className="small muted">
                  {q.sentence.replace('_____', `[${q.blankWord}]`)}
                </p>
              ) : null
            )}
            <button className="primary" onClick={onClose}>
              Continuar
            </button>
          </>
        )}
      </div>
    </div>
  )
}
