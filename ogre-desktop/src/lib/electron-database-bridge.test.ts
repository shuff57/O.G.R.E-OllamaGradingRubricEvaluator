import { beforeEach, describe, expect, it, vi } from 'vitest'

const handlers = new Map<string, (_event: unknown, payload: { sql: string; params?: unknown[] }) => unknown>()

const mockAppGetPath = vi.fn(() => '/tmp')
const mockRemoveHandler = vi.fn((channel: string) => {
  handlers.delete(channel)
})
const mockHandle = vi.fn(
  (channel: string, handler: (_event: unknown, payload: { sql: string; params?: unknown[] }) => unknown) => {
    handlers.set(channel, handler)
  },
)

const mockMigrationSelectAll = vi.fn(() => [])
const mockMigrationInsertRun = vi.fn()
const mockStatementAll = vi.fn(() => [{ key: 'setup_complete', value: 'true' }])
const mockStatementRun = vi.fn(() => ({ changes: 1, lastInsertRowid: 0 }))
const mockExec = vi.fn()
const mockPrepare = vi.fn((sql: string) => {
  if (sql === 'SELECT version FROM _migrations ORDER BY version') {
    return {
      all: mockMigrationSelectAll,
      run: vi.fn(),
    }
  }

  if (sql === 'INSERT OR IGNORE INTO _migrations (version, description) VALUES (?, ?)') {
    return {
      all: vi.fn(),
      run: mockMigrationInsertRun,
    }
  }

  return {
    all: mockStatementAll,
    run: mockStatementRun,
  }
})

const mockDatabase = {
  exec: mockExec,
  prepare: mockPrepare,
  close: vi.fn(),
}

const mockBetterSqlite3 = vi.fn(function MockBetterSqlite3(this: unknown) {
  return mockDatabase
})

vi.mock('electron', () => ({
  app: {
    getPath: mockAppGetPath,
  },
  ipcMain: {
    removeHandler: mockRemoveHandler,
    handle: mockHandle,
  },
}))

vi.mock('better-sqlite3', () => ({
  default: mockBetterSqlite3,
}))

describe('electron-main/database IPC binding', () => {
  beforeEach(() => {
    handlers.clear()
    vi.clearAllMocks()
    mockMigrationSelectAll.mockReturnValue([])
    mockStatementAll.mockReturnValue([{ key: 'setup_complete', value: 'true' }])
    mockStatementRun.mockReturnValue({ changes: 1, lastInsertRowid: 0 })
  })

  it('binds numbered placeholders as an object for db_execute so repeated params work', async () => {
    const { registerDatabaseHandlers } = await import('../../electron-main/database')

    registerDatabaseHandlers()

    const handler = handlers.get('db_execute')
    expect(handler).toBeDefined()

    handler?.(null, {
      sql: `INSERT INTO app_settings (key, value) VALUES ($1, $2)
            ON CONFLICT(key) DO UPDATE SET value = $2`,
      params: ['setup_complete', 'true'],
    })

    expect(mockPrepare).toHaveBeenCalledWith(
      `INSERT INTO app_settings (key, value) VALUES (?1, ?2)
            ON CONFLICT(key) DO UPDATE SET value = ?2`,
    )
    expect(mockStatementRun).toHaveBeenCalledWith({
      1: 'setup_complete',
      2: 'true',
    })
  })

  it('binds repeated numbered placeholders as an object for db_query', async () => {
    const { registerDatabaseHandlers } = await import('../../electron-main/database')

    registerDatabaseHandlers()

    const handler = handlers.get('db_query')
    expect(handler).toBeDefined()

    handler?.(null, {
      sql: 'SELECT * FROM provider_configs WHERE id = $1 OR model = $1',
      params: ['ollama'],
    })

    expect(mockPrepare).toHaveBeenCalledWith(
      'SELECT * FROM provider_configs WHERE id = ?1 OR model = ?1',
    )
    expect(mockStatementAll).toHaveBeenCalledWith({
      1: 'ollama',
    })
  })
})
