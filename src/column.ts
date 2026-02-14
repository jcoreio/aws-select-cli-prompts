import stripAnsi from 'strip-ansi'

export function column(value: any, length: number): string {
  value = String(value ?? '').padEnd(length)
  return stripAnsi(value).length > length ?
      `${value.substring(0, length - 3)}...`
    : value
}
