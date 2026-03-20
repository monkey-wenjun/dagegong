---
name: typeorm-sqlite-patterns
description: "TypeORM with SQLite patterns for the dagegong project. Covers entity definitions, repository patterns, migrations, transaction handling, query optimization, and better-sqlite3 integration in Electron."
---

# TypeORM + SQLite Patterns for dagegong

Comprehensive guide for database operations using TypeORM with better-sqlite3 in Electron.

## Architecture

### Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                      Renderer Process                        │
│  ┌──────────────┐                                          │
│  │  Vue Components │  ←  UI Layer                          │
│  └──────┬───────┘                                          │
│         │ IPC invoke                                        │
│         ↓                                                   │
│  ┌──────────────┐                                          │
│  │  Store/API   │  ←  State Management                     │
│  └──────┬───────┘                                          │
└─────────┼───────────────────────────────────────────────────┘
          │
          │ IPC
          ↓
┌─────────────────────────────────────────────────────────────┐
│                       Main Process                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  IPC Handlers │→ │  Repository  │→ │    TypeORM   │      │
│  └──────────────┘  └──────────────┘  └──────┬───────┘      │
│                                             │               │
│                                             ↓               │
│                                      ┌──────────────┐      │
│                                      │ better-sqlite3│      │
│                                      └──────┬───────┘      │
│                                             │               │
│                                             ↓               │
│                                      ┌──────────────┐      │
│                                      │   SQLite DB  │      │
│                                      └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

## Entity Definitions

### Base Entity Pattern

```typescript
// entity/base.entity.ts
import { PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm'

export abstract class BaseEntity {
  @PrimaryGeneratedColumn()
  id: number

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}

// Usage
import { Entity, Column } from 'typeorm'

@Entity('users')
export class User extends BaseEntity {
  @Column({ type: 'varchar', length: 100, unique: true })
  email: string

  @Column({ type: 'varchar', length: 100 })
  name: string

  @Column({ type: 'boolean', default: false })
  isActive: boolean
}
```

### Entity Naming Conventions

```typescript
// entity/boss-chat-relation.entity.ts
@Entity('boss_chat_relation')  // snake_case table names
export class BossChatRelation {
  @PrimaryGeneratedColumn()
  id: number

  @Column({ name: 'encrypt_user_id' })  // snake_case column names
  encryptUserId: string

  @Column({ name: 'encrypt_boss_id' })
  encryptBossId: string

  @Column({ name: 'sync_time', type: 'datetime' })
  syncTime: Date

  @Column({ name: 'is_active', default: true })
  isActive: boolean
}
```

### Relation Patterns

```typescript
// entity/chat-message.entity.ts
@Entity('chat_messages')
export class ChatMessage {
  @PrimaryGeneratedColumn()
  id: number

  @Column({ name: 'relation_id' })
  relationId: number

  // Foreign key relation (lightweight, no join)
  @Column({ name: 'sender_id' })
  senderId: string

  @Column({ type: 'text' })
  content: string

  @Column({ name: 'sent_at', type: 'datetime' })
  sentAt: Date
}

// For heavy relations, use lazy loading
@Entity('companies')
export class Company {
  @PrimaryGeneratedColumn()
  id: number

  @Column({ name: 'encrypt_company_id', unique: true })
  encryptCompanyId: string

  @OneToMany(() => Job, job => job.company, { lazy: true })
  jobs: Promise<Job[]>
}

@Entity('jobs')
export class Job {
  @PrimaryGeneratedColumn()
  id: number

  @Column({ name: 'company_id' })
  companyId: number

  @ManyToOne(() => Company, company => company.jobs)
  @JoinColumn({ name: 'company_id' })
  company: Company
}
```

## Repository Patterns

### Custom Repository Pattern

```typescript
// repository/boss-chat-relation.repository.ts
import { DataSource, Repository } from 'typeorm'
import { BossChatRelation } from '../entity/boss-chat-relation.entity'

export class BossChatRelationRepository {
  private repository: Repository<BossChatRelation>

  constructor(dataSource: DataSource) {
    this.repository = dataSource.getRepository(BossChatRelation)
  }

  async findByUserId(userId: string): Promise<BossChatRelation[]> {
    return this.repository.find({
      where: { encryptUserId: userId },
      order: { syncTime: 'DESC' }
    })
  }

  async upsertRelations(
    relations: Partial<BossChatRelation>[]
  ): Promise<void> {
    await this.repository
      .createQueryBuilder()
      .insert()
      .into(BossChatRelation)
      .values(relations)
      .orUpdate(
        ['sync_time', 'is_active', 'updated_at'],
        ['encrypt_user_id', 'encrypt_boss_id']
      )
      .execute()
  }

  async getLatestSyncTime(userId: string): Promise<Date | null> {
    const result = await this.repository
      .createQueryBuilder('rel')
      .select('MAX(rel.syncTime)', 'latest')
      .where('rel.encryptUserId = :userId', { userId })
      .getRawOne()

    return result?.latest ? new Date(result.latest) : null
  }
}

// Usage in IPC handler
import { dataSource } from '../data-source'

const bossChatRepo = new BossChatRelationRepository(dataSource)

ipcMain.handle('boss-chat:get-by-user', async (event, userId: string) => {
  return await bossChatRepo.findByUserId(userId)
})
```

### Repository Factory

```typescript
// repository/index.ts
import { DataSource } from 'typeorm'
import { BossChatRelationRepository } from './boss-chat-relation.repository'
import { CompanyRepository } from './company.repository'
import { JobRepository } from './job.repository'

export class RepositoryFactory {
  private static instance: RepositoryFactory
  
  bossChatRelation: BossChatRelationRepository
  company: CompanyRepository
  job: JobRepository

  private constructor(dataSource: DataSource) {
    this.bossChatRelation = new BossChatRelationRepository(dataSource)
    this.company = new CompanyRepository(dataSource)
    this.job = new JobRepository(dataSource)
  }

  static initialize(dataSource: DataSource): void {
    RepositoryFactory.instance = new RepositoryFactory(dataSource)
  }

  static getInstance(): RepositoryFactory {
    if (!RepositoryFactory.instance) {
      throw new Error('RepositoryFactory not initialized')
    }
    return RepositoryFactory.instance
  }
}

// Initialize in main process
import { dataSource } from './data-source'

export async function initializeRepositories() {
  await dataSource.initialize()
  RepositoryFactory.initialize(dataSource)
}

// Usage
const repos = RepositoryFactory.getInstance()
const relations = await repos.bossChatRelation.findByUserId(userId)
```

## Data Source Configuration

### Main Data Source

```typescript
// db/data-source.ts
import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { app } from 'electron'
import * as path from 'path'

// Entities
import { User } from './entity/user.entity'
import { BossChatRelation } from './entity/boss-chat-relation.entity'
import { Company } from './entity/company.entity'
import { Job } from './entity/job.entity'
import { ChatMessage } from './entity/chat-message.entity'

// Migrations
import { Init1699999999999 } from './migration/1699999999999-Init'
import { AddBossChatRelation1700000000000 } from './migration/1700000000000-AddBossChatRelation'

const isDevelopment = process.env.NODE_ENV === 'development'

// Get DB path based on environment
function getDatabasePath(): string {
  if (isDevelopment) {
    return path.join(process.cwd(), 'data', 'app.db')
  }
  
  const userDataPath = app.getPath('userData')
  return path.join(userDataPath, 'data', 'app.db')
}

export const dataSource = new DataSource({
  type: 'better-sqlite3',
  database: getDatabasePath(),
  
  // Entities
  entities: [
    User,
    BossChatRelation,
    Company,
    Job,
    ChatMessage
  ],
  
  // Migrations
  migrations: [
    Init1699999999999,
    AddBossChatRelation1700000000000
  ],
  
  // Settings
  synchronize: false,        // Never true in production!
  migrationsRun: true,       // Auto-run migrations on start
  logging: isDevelopment,    // SQL logging in dev only
  
  // Better-sqlite3 specific
  prepareDatabase: (db) => {
    // Enable WAL mode for better performance
    db.pragma('journal_mode = WAL')
    // Foreign keys
    db.pragma('foreign_keys = ON')
  }
})

// Initialize function
export async function initializeDatabase(): Promise<DataSource> {
  if (!dataSource.isInitialized) {
    await dataSource.initialize()
    console.log('Database initialized')
  }
  return dataSource
}
```

## Migrations

### Creating Migrations

```typescript
// migration/1700000000000-AddBossChatRelation.ts
import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm'

export class AddBossChatRelation1700000000000 implements MigrationInterface {
  name = 'AddBossChatRelation1700000000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'boss_chat_relation',
        columns: [
          {
            name: 'id',
            type: 'integer',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment'
          },
          {
            name: 'encrypt_user_id',
            type: 'varchar',
            length: '100'
          },
          {
            name: 'encrypt_boss_id',
            type: 'varchar',
            length: '100'
          },
          {
            name: 'sync_time',
            type: 'datetime'
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true
          },
          {
            name: 'created_at',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP'
          },
          {
            name: 'updated_at',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP'
          }
        ]
      }),
      true
    )

    // Create indexes
    await queryRunner.createIndex(
      'boss_chat_relation',
      new TableIndex({
        name: 'IDX_USER_BOSS',
        columnNames: ['encrypt_user_id', 'encrypt_boss_id'],
        isUnique: true
      })
    )

    await queryRunner.createIndex(
      'boss_chat_relation',
      new TableIndex({
        name: 'IDX_SYNC_TIME',
        columnNames: ['sync_time']
      })
    )
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('boss_chat_relation')
  }
}
```

### Migration Generation Script

```typescript
// scripts/generate-migration.ts
import { execSync } from 'child_process'
import * as path from 'path'

function generateMigration(name: string): void {
  const timestamp = Date.now()
  const className = `${name}${timestamp}`
  
  const command = `npx typeorm-ts-node-commonjs migration:create src/migration/${className}`
  
  try {
    execSync(command, { stdio: 'inherit' })
    console.log(`Migration created: ${className}`)
  } catch (error) {
    console.error('Failed to create migration:', error)
    process.exit(1)
  }
}

const migrationName = process.argv[2]
if (!migrationName) {
  console.error('Please provide a migration name')
  console.error('Usage: ts-node scripts/generate-migration.ts AddUserTable')
  process.exit(1)
}

generateMigration(migrationName)
```

## Transaction Handling

### Repository-Level Transactions

```typescript
// repository/base.repository.ts
import { DataSource, EntityManager, Repository } from 'typeorm'

export abstract class BaseRepository<T> {
  protected repository: Repository<T>
  protected dataSource: DataSource

  constructor(dataSource: DataSource, entity: new () => T) {
    this.dataSource = dataSource
    this.repository = dataSource.getRepository(entity)
  }

  async withTransaction<R>(
    callback: (manager: EntityManager) => Promise<R>
  ): Promise<R> {
    const queryRunner = this.dataSource.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()

    try {
      const result = await callback(queryRunner.manager)
      await queryRunner.commitTransaction()
      return result
    } catch (error) {
      await queryRunner.rollbackTransaction()
      throw error
    } finally {
      await queryRunner.release()
    }
  }
}

// Usage
class UserRepository extends BaseRepository<User> {
  async transferCredits(
    fromUserId: string,
    toUserId: string,
    amount: number
  ): Promise<void> {
    await this.withTransaction(async (manager) => {
      const userRepo = manager.getRepository(User)
      
      const fromUser = await userRepo.findOne({
        where: { id: fromUserId },
        lock: { mode: 'pessimistic_write' }
      })
      
      if (!fromUser || fromUser.credits < amount) {
        throw new Error('Insufficient credits')
      }
      
      fromUser.credits -= amount
      await userRepo.save(fromUser)
      
      const toUser = await userRepo.findOne({
        where: { id: toUserId },
        lock: { mode: 'pessimistic_write' }
      })
      
      if (!toUser) {
        throw new Error('Recipient not found')
      }
      
      toUser.credits += amount
      await userRepo.save(toUser)
    })
  }
}
```

## Query Optimization

### Batch Operations

```typescript
// Efficient batch insert with chunking
async function batchInsert<T>(
  repository: Repository<T>,
  items: T[],
  chunkSize: number = 100
): Promise<void> {
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize)
    await repository.save(chunk)
  }
}

// Usage
const relations: BossChatRelation[] = // ... fetch from API
await batchInsert(bossChatRepo, relations, 50)
```

### Raw Queries for Complex Operations

```typescript
// When TypeORM query builder is insufficient
async function getChatStatistics(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<ChatStats> {
  const rawStats = await dataSource.query(
    `
    SELECT 
      DATE(sent_at) as date,
      COUNT(*) as message_count,
      COUNT(DISTINCT sender_id) as unique_senders
    FROM chat_messages cm
    INNER JOIN boss_chat_relation bcr ON cm.relation_id = bcr.id
    WHERE bcr.encrypt_user_id = ?
      AND cm.sent_at BETWEEN ? AND ?
    GROUP BY DATE(sent_at)
    ORDER BY date DESC
    `,
    [userId, startDate, endDate]
  )

  return rawStats.map(row => ({
    date: new Date(row.date),
    messageCount: row.message_count,
    uniqueSenders: row.unique_senders
  }))
}
```

## View Entities

### Database Views for Read-Only Data

```typescript
// entity/v-chat-statistics.entity.ts
import { ViewEntity, ViewColumn } from 'typeorm'

@ViewEntity({
  name: 'v_chat_statistics',
  expression: `
    SELECT 
      bcr.id as relation_id,
      bcr.encrypt_boss_id,
      bcr.encrypt_user_id,
      COUNT(cm.id) as message_count,
      MAX(cm.sent_at) as last_message_at
    FROM boss_chat_relation bcr
    LEFT JOIN chat_messages cm ON bcr.id = cm.relation_id
    GROUP BY bcr.id, bcr.encrypt_boss_id, bcr.encrypt_user_id
  `
})
export class VChatStatistics {
  @ViewColumn({ name: 'relation_id' })
  relationId: number

  @ViewColumn({ name: 'encrypt_boss_id' })
  encryptBossId: string

  @ViewColumn({ name: 'encrypt_user_id' })
  encryptUserId: string

  @ViewColumn({ name: 'message_count' })
  messageCount: number

  @ViewColumn({ name: 'last_message_at' })
  lastMessageAt: Date
}
```

## Error Handling

### Database Error Wrapper

```typescript
// utils/db-error-handler.ts
import { QueryFailedError } from 'typeorm'

export enum DbErrorCode {
  UNIQUE_VIOLATION = 'SQLITE_CONSTRAINT_UNIQUE',
  FOREIGN_KEY_VIOLATION = 'SQLITE_CONSTRAINT_FOREIGNKEY',
  NOT_NULL_VIOLATION = 'SQLITE_CONSTRAINT_NOTNULL'
}

export class DatabaseError extends Error {
  constructor(
    message: string,
    public code: string,
    public originalError?: Error
  ) {
    super(message)
    this.name = 'DatabaseError'
  }
}

export function handleDbError(error: unknown): never {
  if (error instanceof QueryFailedError) {
    const driverError = error.driverError as any
    
    switch (driverError?.code) {
      case DbErrorCode.UNIQUE_VIOLATION:
        throw new DatabaseError(
          'Record already exists',
          driverError.code,
          error
        )
      case DbErrorCode.FOREIGN_KEY_VIOLATION:
        throw new DatabaseError(
          'Referenced record does not exist',
          driverError.code,
          error
        )
      default:
        throw new DatabaseError(
          'Database operation failed',
          driverError?.code || 'UNKNOWN',
          error
        )
    }
  }
  
  throw error
}

// Usage in repository
async function createUser(userData: CreateUserDto): Promise<User> {
  try {
    return await this.repository.save(userData)
  } catch (error) {
    handleDbError(error)
  }
}
```

## Best Practices

### DO
- ✅ Use migrations for schema changes (never synchronize in production)
- ✅ Index frequently queried columns
- ✅ Use transactions for multi-step operations
- ✅ Limit query results with pagination
- ✅ Use views for complex read-only queries
- ✅ Close connections properly in error cases

### DON'T
- ❌ Use synchronize: true in production
- ❌ Load all relations eagerly
- ❌ Store large blobs in SQLite (use file system)
- ❌ Forget to handle constraint violations
- ❌ Run long queries on UI thread
- ❌ Ignore migration failures
