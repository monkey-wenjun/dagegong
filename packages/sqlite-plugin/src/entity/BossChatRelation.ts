import * as typeorm from 'typeorm';
const { Entity, Column, PrimaryGeneratedColumn, Index } = typeorm

export enum ChatRelationStatus {
  ACTIVE = 1,
  CLOSED = 0
}

@Entity()
export class BossChatRelation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  friendId: number;

  @Column()
  encryptBossId: string;

  @Column()
  bossName: string;

  @Column({ nullable: true })
  bossTitle?: string;

  @Column()
  bossAvatar?: string;

  @Column()
  encryptJobId: string;

  @Column()
  jobName: string;

  @Column()
  brandName: string;

  @Column()
  encryptCompanyId?: string;

  @Column()
  encryptUserId: string;

  @Column({ type: 'text', nullable: true })
  lastText?: string;

  @Column({ nullable: true })
  lastMessageId?: string;

  @Column({ default: 0 })
  unreadCount: number;

  @Column({ nullable: true })
  lastMsgStatus?: number;

  @Column({ nullable: true })
  lastTS?: number;

  @Column()
  updateTime: number;

  @Column({ default: 0 })
  isTop: number;

  @Column({ nullable: true })
  relationType?: number;

  @Column({ nullable: true })
  friendSource?: number;

  @Column({ nullable: true })
  goldGeekStatus?: number;

  @Column({ type: 'text', nullable: true })
  sourceTitle?: string;

  @Column({ default: true })
  lastIsSelf: boolean;

  @Column({ type: 'simple-json', nullable: true })
  extInfo?: any;

  @Column()
  syncTime: Date;
}
