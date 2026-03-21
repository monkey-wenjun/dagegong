import "reflect-metadata";
import * as typeorm from 'typeorm';
const { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } = typeorm

export enum InterviewStage {
  PHONE_INTERVIEW = 'phone_interview',      // 电话面试
  ONLINE_INTERVIEW = 'online_interview',    // 视频面试
  ONSITE_INTERVIEW = 'onsite_interview',    // 现场面试
  HR_INTERVIEW = 'hr_interview',            // HR面试
  OFFER_NEGOTIATION = 'offer_negotiation',  // 谈薪阶段
  OFFER_ACCEPTED = 'offer_accepted',        // 已接offer
  REJECTED = 'rejected',                    // 未通过
  WITHDRAWN = 'withdrawn',                  // 已放弃
}

export enum InterviewSource {
  FROM_CHAT = 'from_chat',                  // 从沟通记录标记
  MANUAL_ADD = 'manual_add',                // 手动添加
}

@Entity()
export class InterviewRecord {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  encryptBossId: string;

  @Column()
  encryptJobId: string;

  @Column({ nullable: true })
  encryptUserId?: string;

  @Column()
  bossName: string;

  @Column({ nullable: true })
  bossTitle?: string;

  @Column()
  brandName: string;

  @Column()
  jobName: string;

  @Column({
    type: 'simple-enum',
    enum: InterviewStage,
    default: InterviewStage.PHONE_INTERVIEW
  })
  stage: InterviewStage;

  @Column({
    type: 'simple-enum',
    enum: InterviewSource,
    default: InterviewSource.FROM_CHAT
  })
  source: InterviewSource;

  @Column({ nullable: true })
  notes?: string;

  @Column({ nullable: true })
  interviewTime?: Date;

  @Column({ nullable: true })
  address?: string;

  @Column({ nullable: true })
  contactPhone?: string;

  @Column({ nullable: true })
  contactName?: string;

  @Column({ default: false })
  isOfferReceived: boolean;

  @Column({ nullable: true })
  salaryOffered?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  lastChatText?: string;

  @Column({ nullable: true })
  lastChatTime?: Date;
}
