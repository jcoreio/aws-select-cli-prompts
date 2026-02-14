/* eslint-disable no-console */
import jmespath from 'jmespath'
import yargs from 'yargs/yargs'

export async function makeCli({
  select,
  queries,
}: {
  select: (options: Record<string, any>) => Promise<unknown>
  queries?: Record<string, string>
}): Promise<void> {
  try {
    const argv = await yargs(process.argv.slice(2))
      .options({
        query: { type: 'string', description: 'print value at this JMESPath' },
        ...(queries ?
          Object.fromEntries(
            Object.entries(queries).map(([k, v]) => [
              k,
              { type: 'boolean', description: `print ${v}` },
            ])
          )
        : {}),
      })
      .help()
      .parse()

    let { query } = argv
    let prevQueryOpt = '--query'
    for (const key in queries) {
      if (!argv[key]) continue
      if (query) {
        console.error(`can't use --${prevQueryOpt} together with --${key}`)
        process.exit(1)
      }
      prevQueryOpt = key
      query = queries[key]
    }

    const selected = await select(argv)
    const result = query ? jmespath.search(selected, query) : selected
    console.log(
      result instanceof Object ? JSON.stringify(result, null, 2) : result
    )
    process.exit(0)
  } catch (error) {
    console.error(error)
    process.exit(1)
  }
}
