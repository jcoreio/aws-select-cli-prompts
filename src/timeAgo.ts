import TimeAgo from 'javascript-time-ago'

import en from 'javascript-time-ago/locale/en'

TimeAgo.addLocale(en)

const _timeAgo = new TimeAgo('en-US')

export default function timeAgo(input: number | Date | undefined): string {
  if (input == null) return ''
  const result = _timeAgo.format(input)
  return Array.isArray(result) ? result[0] : result
}
