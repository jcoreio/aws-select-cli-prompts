import os from 'os'
import path from 'path'
import fs from 'fs-extra'

/* eslint-disable @typescript-eslint/no-explicit-any */
const RECENTS_FILE = path.join(
  os.homedir(),
  '.aws-select-cli-prompts',
  'recents.json'
)

export async function loadRecents<T>(category: string[]): Promise<T[]> {
  try {
    const recents = await fs.readJson(RECENTS_FILE)
    return (recents?.[JSON.stringify(category)] || []).map(
      (c: any): T =>
        Object.fromEntries(
          [...Object.entries(c)].map(([key, value]) => [
            key,
            typeof value === 'string' &&
            /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/.test(value)
              ? new Date(value)
              : value,
          ])
        ) as any
    )
  } catch (error) {
    if ((error as any).code !== 'EEXIST' && (error as any).code !== 'ENOENT') {
      // eslint-disable-next-line no-console
      console.error(
        `failed to load recent selections from ${RECENTS_FILE}: ${
          (error as any).message
        }`
      )
    }
    return []
  }
}

export async function addRecent<T>(
  category: string[],
  newRecent: T,
  getId: (recent: T) => any
): Promise<void> {
  try {
    const key = JSON.stringify(category)
    await fs.mkdirs(path.dirname(RECENTS_FILE))
    const original = await fs.readJson(RECENTS_FILE).catch(() => ({}))
    const list: object[] = (original?.[key] || []).filter(
      (c: any) => getId(c) !== getId(newRecent)
    )
    list.unshift(newRecent as any)
    if (list.length > 20) list.pop()
    await fs.writeJson(RECENTS_FILE, { ...original, [key]: list })
    await fs.chmod(RECENTS_FILE, 0o600)
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      `failed to save selection to ${RECENTS_FILE}: ${(error as any).message}`
    )
  }
}
