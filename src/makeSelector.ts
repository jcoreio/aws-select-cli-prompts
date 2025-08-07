import { EC2ClientConfig } from '@aws-sdk/client-ec2'
import {
  CancelationToken,
  Choices,
  Style,
  asyncAutocomplete,
} from 'async-autocomplete-cli'
import chalk, { Chalk } from 'chalk'
import { Readable, Writable } from 'stream'
import { addRecent, loadRecents } from './recents'
import { get as valueAtPath } from 'lodash'
import timeAgo from './timeAgo'

type PathIn<T> = T extends Array<infer E>
  ? `[${number}]${SubpathIn<E>}`
  : T extends object
  ? ObjectPath<T, keyof T>
  : never

type ObjectPath<T, K> = K extends string & keyof T
  ? `${K}${SubpathIn<T[K]>}`
  : never

type SubpathIn<T> = T extends Array<infer E>
  ? `[${number}]${SubpathIn<E>}`
  : T extends object
  ? `.${ObjectPath<T, keyof T>}`
  : ''

type PathAndTypeIn<T, Path extends string = ''> = NonNullable<T> extends Date
  ? [Path, T]
  : NonNullable<T> extends Array<infer E>
  ? PathAndTypeIn<E, `${Path}[${number}]`>
  : NonNullable<T> extends object
  ? ObjectPathAndType<NonNullable<T>, Path, keyof NonNullable<T>>
  : [Path, T]

type ObjectPathAndType<T, Path extends string, K> = K extends string & keyof T
  ? PathAndTypeIn<T[K], Path extends '' ? K : `${Path}.${K}`>
  : never

type PathsOf<T> = T extends [infer Path, any] ? Path : never

type ValueOfPath<PathAndTypeTuples, Path> = PathAndTypeTuples extends [
  Path,
  infer Value
]
  ? Value
  : never

type PathAndTypeMap<T> = {
  [Path in PathsOf<PathAndTypeIn<T>>]: ValueOfPath<PathAndTypeIn<T>, Path>
}

type BasicColumnProps = {
  width?: number
  grow?: number
  minWidth?: number
  showRecent?: boolean
}

type ColumnMap<Item, Obj = PathAndTypeMap<Item>> = {
  [K in keyof Obj]?: {
    format?:
      | ((value: Obj[K]) => string)
      | (NonNullable<Obj[K]> extends string
          ? { [Value in NonNullable<Obj[K]>]?: string } & {
              __other__?: (value: any) => string
            }
          : never)
    colors?: NonNullable<Obj[K]> extends string
      ? { [Value in NonNullable<Obj[K]> | '__other__']?: Chalk }
      : never
  } & BasicColumnProps
} & {
  [K in `__${string}__`]?: {
    get: (item: Item) => any
    format?: (value: any) => string
    colors?: Record<string, Chalk>
  } & BasicColumnProps
}

type NormalizedColumn<Item> = {
  get: (item: Item) => any
  format: (item: Item, value: any) => string
  colors?: Record<string, Chalk>
} & BasicColumnProps

type Columns<Item> =
  | ({
      get: PathIn<Item> | ((item: Item) => any)
      format?: (value: any) => string
      colors?: Record<string, Chalk>
    } & BasicColumnProps)[]
  | ColumnMap<Item>

const RECENT = Symbol('RECENT')

export function makeSelector<OtherOptions, Client, Page, Item, Id>({
  thing,
  things = `${thing}s`,
  defaultLimit,
  recentKey,
  getClient,
  getOtherOptions,
  getPage,
  getSearchText,
  refetchRecent,
  getItems,
  getId,
  columns: defaultColumns,
}: {
  thing: string
  things?: string
  defaultLimit?: number
  recentKey: string[] | ((otherOptions: OtherOptions) => string[])
  getClient: (config: EC2ClientConfig) => Client
  getPage: (options: {
    client: Client
    otherOptions: OtherOptions
    limit?: number
    search?: string
    abortSignal?: AbortSignal
  }) => Promise<Page>
  getOtherOptions?: (options: any) => OtherOptions | Promise<OtherOptions>
  refetchRecent?: (options: {
    otherOptions: OtherOptions
    client: Client
    item: Item
    id: Id
    abortSignal?: AbortSignal
  }) => Promise<Item | undefined>
  getItems: (page: Page) => Item[] | undefined
  getId: (item: Item) => Id | undefined
  getSearchText?: (item: Item) => string | undefined
  columns: Columns<Item>
}) {
  return async (
    {
      client = getClient({}),
      message,
      limit = defaultLimit,
      useRecents = true,
      stdin = process.stdin,
      stdout = process.stderr,
      style,
      clearFirst,
      filterItems = () => true,
      columns = defaultColumns,
      ...rest
    }: {
      client?: Client
      useRecents?: boolean
      message?: string
      limit?: number
      style?: Style
      clearFirst?: boolean
      stdin?: Readable
      stdout?: Writable
      filterItems?: (item: Item) => boolean
      columns?: Columns<Item>
    } & OtherOptions = {} as any
  ): Promise<Item> => {
    const createTitle = makeCreateTitle(columns)

    const region = await (client as any).config.region()
    if (!message) {
      message = `Select ${
        /^[aeiou]/i.test(thing) ? 'an' : 'a'
      } ${thing} (region: ${region})`
    }

    const profile =
      process.env.AWS_PROFILE ||
      (await (client as any).config.credentials()).accessKeyId

    const otherOptions = ((await getOtherOptions?.(rest)) ?? rest) as any

    const finalRecentKey =
      typeof recentKey === 'function' ? recentKey(otherOptions) : recentKey

    let selected: Item | undefined = await asyncAutocomplete({
      limit: process.stdout.rows - 1,
      style,
      clearFirst,
      stdin,
      stdout,
      message,
      suggest: async (
        search: string,
        cancelationToken: CancelationToken,
        yieldChoices: (choices: Choices<Item>) => void
      ): Promise<Choices<Item> | void> => {
        let choices: Choices<Item> = []

        if (!search && useRecents) {
          choices.push(
            ...(
              await loadRecents<Item>([...finalRecentKey, profile, region])
            ).map((item) => {
              const value = { ...item, [RECENT]: true }
              return {
                value,
                title: createTitle(value),
              }
            })
          )
          yieldChoices(choices)
        }

        if (cancelationToken.canceled) return []
        const ac = new AbortController()
        cancelationToken.once('canceled', () => ac.abort())
        const page = await getPage({
          client,
          abortSignal: ac.signal,
          search,
          otherOptions,
          limit,
        })

        let items = getItems(page) || []
        if (getSearchText && search) {
          const searchLower = search.toLowerCase()
          items = items.filter((item) =>
            getSearchText(item)?.toLowerCase().includes(searchLower)
          )
        }
        for (const item of items) {
          choices.push({
            value: item,
            title: createTitle(item),
          })
        }
        choices = choices.filter((c) => filterItems(c.value))
        if (!choices.length) {
          choices.push({
            title: chalk.gray(`No matching ${things} found`),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            value: undefined as any,
          })
        }

        return choices
      },
    })
    if (!selected) throw new Error(`no ${thing} was selected`)

    const id = getId(selected)

    if ((selected as any)[RECENT]) {
      if (id == null) {
        throw new Error(`failed to get id of selected ${thing}`)
      }
      selected = await refetchRecent?.({
        client,
        item: selected,
        id,
        otherOptions,
      })
    }
    if (!selected) throw new Error(`recent ${thing} not found: ${id}`)

    if (useRecents) {
      await addRecent([...finalRecentKey, profile, region], selected, getId)
    }
    return selected
  }
}

function makeCreateTitle<Item>(columns: Columns<Item>): (item: Item) => string {
  const normalizedColumns: NormalizedColumn<Item>[] = []
  if (Array.isArray(columns)) {
    for (const { get, format, showRecent, ...rest } of columns) {
      normalizedColumns.push({
        ...rest,
        ...(format === timeAgo ? { width: '59 minutes ago'.length } : {}),
        get: (item: Item) => {
          return typeof get === 'string' ? valueAtPath(item, get) : get(item)
        },
        format: (item: Item, value: any) =>
          showRecent && (item as any)[RECENT]
            ? '(recent)'
            : value == null
            ? ''
            : format
            ? format(value)
            : value,
      })
    }
  } else {
    for (const key of Object.keys(columns) as (keyof Columns<Item>)[]) {
      const column = columns[key]
      const format = column?.format
      const showRecent = column?.showRecent
      normalizedColumns.push({
        ...columns[key],
        ...(format === timeAgo ? { width: '59 minutes ago'.length } : {}),
        get: /^__.*__$/.test(key)
          ? (column as any).get
          : (item: Item) => valueAtPath(item, key),
        format: (item, value) =>
          showRecent && (item as any)[RECENT]
            ? '(recent)'
            : value == null
            ? ''
            : typeof format === 'function'
            ? format(value)
            : format?.[value] ?? (format as any)?.__other__?.(value) ?? value,
      })
    }
  }
  const separator = '  '
  const availableWidth = process.stdout.columns - 4
  let fixedWidth = normalizedColumns.reduce(
    (total, c) =>
      total + Math.max(c.minWidth ?? 0, c.width ?? 0) + separator.length,
    0
  )
  let excess: number
  while ((excess = fixedWidth - availableWidth) > 0) {
    const c = normalizedColumns[normalizedColumns.length - 1]
    const minWidth = Math.max(c.minWidth ?? 0, c.width ?? 0)
    if (minWidth > excess) {
      if (c.minWidth != null) c.minWidth = Math.max(0, c.minWidth - excess)
      if (c.width != null) c.width = Math.max(0, c.width - excess)
      break
    }
    fixedWidth -= minWidth + separator.length
    normalizedColumns.pop()
  }

  const totalGrow = Math.max(
    1,
    normalizedColumns.reduce(
      (total, c) => total + (c.grow ?? (c.width != null ? 0 : 1)),
      0
    )
  )
  const remainingWidth = Math.max(0, availableWidth - fixedWidth)
  const columnWidths = normalizedColumns.map(
    ({ width, minWidth, grow = 1 }) =>
      width ?? (minWidth ?? 0) + Math.floor((remainingWidth * grow) / totalGrow)
  )

  return (item: Item): string => {
    return normalizedColumns
      .map((c, i) => {
        const width = columnWidths[i]
        const value = c.get(item)
        let formatted = c.format(item, value)
        if (formatted.length > width) {
          const leftHalf = Math.floor(width / 2)
          const rightHalf = width - leftHalf - 1
          formatted = [
            formatted.substring(0, leftHalf),
            formatted.substring(formatted.length - rightHalf),
          ].join('…')
        } else if (formatted.length < width) {
          formatted = formatted.padEnd(width)
        }
        if (c.showRecent && (item as any)[RECENT]) {
          formatted = chalk.magenta(formatted)
        } else if (c.colors?.[value]) formatted = c.colors[value](formatted)
        else if (c.colors?.__other__) formatted = c.colors.__other__(formatted)
        return formatted
      })
      .join(separator)
  }
}
