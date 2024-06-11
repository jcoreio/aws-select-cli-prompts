import stripAnsi from 'strip-ansi'

export function column(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any,
  length: number
): string {
  value = String(value ?? '').padEnd(length)
  return stripAnsi(value).length > length
    ? `${value.substring(0, length - 3)}...`
    : value
}
