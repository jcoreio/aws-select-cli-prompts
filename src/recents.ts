import AWS from 'aws-sdk'
import { Choice, Choices } from 'async-autocomplete-cli'
import os from 'os'
import path from 'path'
import fs from 'fs-extra'

const RECENTS_FILE = path.join(
  os.homedir(),
  '.aws-select-cli-prompts',
  'recents.json'
)

function getAccessKeyId(config: AWS.Config): string {
  const result = config.credentials?.accessKeyId
  if (!result) {
    throw new Error(`failed to get accessKeyId from AWS config`)
  }
  return result
}

export async function loadRecents<T>(
  config: AWS.Config,
  category: string
): Promise<Choices<T>> {
  try {
    const accessKeyId = getAccessKeyId(config)
    const recents = await fs.readJson(RECENTS_FILE)
    return recents[accessKeyId]?.[category] || []
  } catch (error) {
    if (error.code !== 'EEXIST' && error.code !== 'ENOENT') {
      // eslint-disable-next-line no-console
      console.error(
        `failed to load recent selections from ${RECENTS_FILE}: ${error.message}`
      )
    }
    return []
  }
}

export async function addRecent<T>(
  config: AWS.Config,
  category: string,
  newRecent: Choice<T>
): Promise<void> {
  try {
    const accessKeyId = getAccessKeyId(config)
    await fs.mkdirs(path.dirname(RECENTS_FILE))
    const original = await fs.readJson(RECENTS_FILE).catch(() => ({}))
    const list: Choices<T> = (original[accessKeyId]?.[category] || []).filter(
      (c: Choice<T>) => c.value !== newRecent.value
    )
    list.unshift(newRecent)
    if (list.length > 20) list.pop()
    await fs.writeJson(RECENTS_FILE, {
      ...original,
      [accessKeyId]: {
        ...original[accessKeyId],
        [category]: list,
      },
    })
    await fs.chmod(RECENTS_FILE, 0o600)
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      `failed to save selection to ${RECENTS_FILE}: ${error.message}`
    )
  }
}
