function datePart(part: number, length = 2): string {
  return String(part).padStart(length, '0')
}

export function formatDate(date: Date | null | undefined): string {
  if (!date) return ''
  const y = date.getFullYear()
  const M = date.getMonth() + 1
  const d = date.getDate()
  const h = date.getHours()
  const m = date.getMinutes()
  return `${datePart(y)}/${datePart(M)}/${datePart(d)} ${datePart(
    h
  )}:${datePart(m)}`
}
