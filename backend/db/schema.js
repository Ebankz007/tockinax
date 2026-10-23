// tockinax — canonical PostgreSQL schema (Drizzle ORM, pg)
// Money: numeric(19,4) + ISO currency. Ledger append-only (revoked in migration SQL).
const {
  pgTable, uuid, text, varchar, integer, bigint, numeric, boolean,
  timestamp, jsonb, pgEnum, uniqueIndex, index, check, primaryKey,
} = require('drizzle-orm/pg-core');
const { sql } = require('drizzle-orm');

const now = () => sql`now()`;

const userStatus = pgEnum('user_status', ['pending_email', 'pending_verification', 'active', 'suspended', 'banned']);
const orderStatus = pgEnum('order_status', ['draft', 'pending_payment', 'evidence_submitted', 'under_review', 'completed', 'cancelled', 'expired', 'disputed', 'resolved_completed']);
const payoutStatus = pgEnum('payout_status', ['requested', 'under_review', 'approved', 'processing', 'paid', 'rejected', 'failed', 'cancelled', 'reversed']);
const campaignStatus = pgEnum('campaign_status', ['draft', 'pending_approval', 'scheduled', 'active', 'paused', 'completed', 'cancelled']);

const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 320 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  status: userStatus('status').notNull().default('pending_email'),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  mfaSecret: text('mfa_secret'),
  mfaEnabled: boolean('mfa_enabled').notNull().default(false),
  referralCode: varchar('referral_code', { length: 16 }).notNull(),
  referredBy: uuid('referred_by'),
  termsVersion: varchar('terms_version', { length: 16 }),
  termsAcceptedAt: timestamp('terms_accepted_at', { withTimezone: true }),
  sellerEnabled: boolean('seller_enabled').notNull().default(false),
  failedLogins: integer('failed_logins').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  stage: integer('stage').notNull().default(1),
  memberNo: varchar('member_no', { length: 16 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('users_email_uidx').on(sql`lower(${t.email})`),
  uniqueIndex('users_referral_code_uidx').on(t.referralCode),
  uniqueIndex('users_member_no_uidx').on(t.memberNo),
  index('users_status_idx').on(t.status),
]);

const userProfiles = pgTable('user_profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  displayName: varchar('display_name', { length: 120 }),
  phone: varchar('phone', { length: 32 }),
  country: varchar('country', { length: 2 }).default('NG'),
  usdtAddressBep20: varchar('usdt_bep20', { length: 128 }),
  usdtAddressTrc20: varchar('usdt_trc20', { length: 128 }),
  avatarUrl: text('avatar_url'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 64 }).notNull().unique(),
  description: text('description'),
});
const permissions = pgTable('permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: varchar('key', { length: 128 }).notNull().unique(),
  description: text('description'),
});
const userRoles = pgTable('user_roles', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  roleId: uuid('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  grantedBy: uuid('granted_by').references(() => users.id),
  grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.roleId] })]);

const userSessions = pgTable('user_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  refreshHash: text('refresh_hash').notNull().unique(),
  ip: varchar('ip', { length: 64 }),
  userAgent: text('user_agent'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('sessions_user_idx').on(t.userId)]);

const identityChecks = pgTable('identity_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: varchar('kind', { length: 32 }).notNull(), // email | kyc | business
  status: varchar('status', { length: 24 }).notNull().default('pending'), // pending|passed|failed|expired
  evidenceRef: text('evidence_ref'), // private storage key, never public
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
const consentRecords = pgTable('consent_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  doc: varchar('doc', { length: 32 }).notNull(), // terms | privacy | refunds
  version: varchar('version', { length: 16 }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull().defaultNow(),
  ip: varchar('ip', { length: 64 }),
});

const serviceFees = pgTable('service_fees', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: varchar('key', { length: 64 }).notNull().unique(), // registration | seller_activation
  amount: numeric('amount', { precision: 19, scale: 4 }).notNull().default('0'),
  currency: varchar('currency', { length: 8 }).notNull().default('USD'),
  description: text('description').notNull().default(''),
  refundPolicy: text('refund_policy').notNull().default(''),
  active: boolean('active').notNull().default(true),
});
const servicePayments = pgTable('service_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  feeKey: varchar('fee_key', { length: 64 }).notNull(),
  amount: numeric('amount', { precision: 19, scale: 4 }).notNull(),
  currency: varchar('currency', { length: 8 }).notNull(),
  provider: varchar('provider', { length: 32 }).notNull().default('stub'),
  providerRef: varchar('provider_ref', { length: 128 }),
  status: varchar('status', { length: 24 }).notNull().default('pending'), // pending|confirmed|failed — ONLY 'confirmed' (signed webhook) activates
  idempotencyKey: varchar('idempotency_key', { length: 64 }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

const listings = pgTable('listings', {
  id: uuid('id').primaryKey().defaultRandom(),
  sellerId: uuid('seller_id').notNull().references(() => users.id),
  title: varchar('title', { length: 160 }).notNull(),
  description: text('description').notNull(),
  category: varchar('category', { length: 64 }).notNull().default('general'),
  price: numeric('price', { precision: 19, scale: 4 }).notNull(),
  currency: varchar('currency', { length: 8 }).notNull(),
  stock: integer('stock').notNull().default(1),
  status: varchar('status', { length: 24 }).notNull().default('draft'), // draft|pending_review|active|suspended|removed
  deliveryTerms: text('delivery_terms'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('listings_seller_idx').on(t.sellerId), index('listings_status_idx').on(t.status)]);
const listingImages = pgTable('listing_images', {
  id: uuid('id').primaryKey().defaultRandom(),
  listingId: uuid('listing_id').notNull().references(() => listings.id, { onDelete: 'cascade' }),
  storageKey: text('storage_key').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderNo: varchar('order_no', { length: 24 }).notNull().unique(),
  buyerId: uuid('buyer_id').notNull().references(() => users.id),
  sellerId: uuid('seller_id').notNull().references(() => users.id),
  listingId: uuid('listing_id').references(() => listings.id),
  amount: numeric('amount', { precision: 19, scale: 4 }).notNull(),
  currency: varchar('currency', { length: 8 }).notNull(),
  platformFee: numeric('platform_fee', { precision: 19, scale: 4 }).notNull().default('0'),
  status: orderStatus('status').notNull().default('draft'),
  paymentMethod: varchar('payment_method', { length: 48 }),
  paymentInstructions: text('payment_instructions'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('orders_buyer_idx').on(t.buyerId), index('orders_seller_idx').on(t.sellerId), index('orders_status_idx').on(t.status)]);
const orderItems = pgTable('order_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 160 }).notNull(),
  qty: integer('qty').notNull().default(1),
  unitPrice: numeric('unit_price', { precision: 19, scale: 4 }).notNull(),
});
const paymentEvidence = pgTable('payment_evidence', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  submittedBy: uuid('submitted_by').notNull().references(() => users.id),
  storageKey: text('storage_key'),
  providerRef: varchar('provider_ref', { length: 128 }),
  note: text('note'),
  // NEVER trust this alone: order stays pending until signed webhook or manual dual review.
  reviewStatus: varchar('review_status', { length: 24 }).notNull().default('pending'),
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
const paymentProviderEvents = pgTable('payment_provider_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: varchar('provider', { length: 32 }).notNull(),
  eventId: varchar('event_id', { length: 128 }).notNull(),
  payload: jsonb('payload').notNull(),
  signatureOk: boolean('signature_ok').notNull().default(false),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('provider_event_uidx').on(t.provider, t.eventId)]);

const disputes = pgTable('disputes', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().references(() => orders.id),
  openedBy: uuid('opened_by').notNull().references(() => users.id),
  reason: text('reason').notNull(),
  status: varchar('status', { length: 24 }).notNull().default('open'), // open|under_review|resolved|rejected
  assignee: uuid('assignee').references(() => users.id),
  resolution: text('resolution'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
});
const supportTickets = pgTable('support_tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  subject: varchar('subject', { length: 160 }).notNull(),
  category: varchar('category', { length: 48 }).notNull().default('general'),
  status: varchar('status', { length: 24 }).notNull().default('open'),
  assignee: uuid('assignee').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
const supportMessages = pgTable('support_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketId: uuid('ticket_id').notNull().references(() => supportTickets.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id').references(() => users.id),
  body: text('body').notNull(),
  internal: boolean('internal').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Referrals — immutable attribution + closure table (max depth 5)
const referrals = pgTable('referrals', {
  id: uuid('id').primaryKey().defaultRandom(),
  ancestorId: uuid('ancestor_id').notNull().references(() => users.id),
  descendantId: uuid('descendant_id').notNull().references(() => users.id),
  depth: integer('depth').notNull(), // 1..5
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('referrals_pair_uidx').on(t.ancestorId, t.descendantId),
  check('referrals_depth_ck', sql`${t.depth} >= 1 AND ${t.depth} <= 5`),
  check('referrals_no_self', sql`${t.ancestorId} <> ${t.descendantId}`),
]);
const referralClosure = pgTable('referral_closure', {
  ancestorId: uuid('ancestor_id').notNull().references(() => users.id),
  descendantId: uuid('descendant_id').notNull().references(() => users.id),
  depth: integer('depth').notNull(),
}, (t) => [primaryKey({ columns: [t.ancestorId, t.descendantId] })]);

const commissionRules = pgTable('commission_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  version: integer('version').notNull(),
  level: integer('level').notNull(),
  rateBps: integer('rate_bps').notNull(), // 500 = 5%
  basis: varchar('basis', { length: 48 }).notNull().default('eligible_verified_sales'),
  eligibilityJson: jsonb('eligibility_json').notNull().default({}),
  effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().defaultNow(),
  effectiveTo: timestamp('effective_to', { withTimezone: true }),
  budgetCap: numeric('budget_cap', { precision: 19, scale: 4 }),
  confirmationDays: integer('confirmation_days').notNull().default(7),
  active: boolean('active').notNull().default(false),
  category: varchar('category', { length: 32 }),
}, (t) => [uniqueIndex('commission_rules_ver_level_uidx').on(t.version, t.level)]);
const commissionCalculations = pgTable('commission_calculations', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().references(() => orders.id),
  beneficiaryId: uuid('beneficiary_id').notNull().references(() => users.id),
  level: integer('level').notNull(),
  ruleVersion: integer('rule_version').notNull(),
  baseAmount: numeric('base_amount', { precision: 19, scale: 4 }).notNull(),
  amount: numeric('amount', { precision: 19, scale: 4 }).notNull(),
  currency: varchar('currency', { length: 8 }).notNull(),
  status: varchar('status', { length: 24 }).notNull().default('pending'), // pending|confirmed|payable|paid|reversed
  category: varchar('category', { length: 32 }),
  generation: integer('generation'),
  idempotencyKey: varchar('idempotency_key', { length: 96 }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

const rewardCampaigns = pgTable('reward_campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 120 }).notNull().unique(),
  description: text('description').notNull().default(''),
  status: campaignStatus('status').notNull().default('draft'),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  timezone: varchar('timezone', { length: 48 }).notNull().default('Africa/Lagos'),
  qualifyingActivity: varchar('qualifying_activity', { length: 64 }).notNull().default('qualifying_sales_revenue'),
  rewardRateBps: integer('reward_rate_bps').notNull().default(0),
  minActivity: numeric('min_activity', { precision: 19, scale: 4 }),
  maxActivity: numeric('max_activity', { precision: 19, scale: 4 }),
  budgetCap: numeric('budget_cap', { precision: 19, scale: 4 }),
  fundingSource: text('funding_source'), // NULL = payouts blocked
  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
const campaignEligibility = pgTable('campaign_eligibility', {
  campaignId: uuid('campaign_id').notNull().references(() => rewardCampaigns.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  eligible: boolean('eligible').notNull().default(true),
  reason: text('reason'),
}, (t) => [primaryKey({ columns: [t.campaignId, t.userId] })]);
const rewardCalculations = pgTable('reward_calculations', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignId: uuid('campaign_id').notNull().references(() => rewardCampaigns.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  sourceOrderId: uuid('source_order_id').references(() => orders.id),
  baseAmount: numeric('base_amount', { precision: 19, scale: 4 }).notNull(),
  amount: numeric('amount', { precision: 19, scale: 4 }).notNull(),
  currency: varchar('currency', { length: 8 }).notNull(),
  ruleVersion: integer('rule_version').notNull().default(1),
  status: varchar('status', { length: 24 }).notNull().default('pending'),
  idempotencyKey: varchar('idempotency_key', { length: 96 }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Double-entry ledger (append-only enforced in migration SQL via REVOKE)
const ledgerAccounts = pgTable('ledger_accounts', {
  code: varchar('code', { length: 64 }).primaryKey(),
  type: varchar('type', { length: 24 }).notNull(), // ASSET|LIABILITY|REVENUE|EXPENSE|MEMO
  currency: varchar('currency', { length: 8 }).notNull().default('USD'),
  description: text('description'),
});
const ledgerTransactions = pgTable('ledger_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceType: varchar('source_type', { length: 48 }).notNull(),
  sourceId: uuid('source_id'),
  currency: varchar('currency', { length: 8 }).notNull(),
  memo: text('memo'),
  idempotencyKey: varchar('idempotency_key', { length: 96 }).notNull().unique(),
  postedAt: timestamp('posted_at', { withTimezone: true }).notNull().defaultNow(),
});
const ledgerEntries = pgTable('ledger_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  txId: uuid('tx_id').notNull().references(() => ledgerTransactions.id),
  account: varchar('account', { length: 64 }).notNull().references(() => ledgerAccounts.code),
  debit: numeric('debit', { precision: 19, scale: 4 }).notNull().default('0'),
  credit: numeric('credit', { precision: 19, scale: 4 }).notNull().default('0'),
  reversesId: uuid('reverses_id'),
}, (t) => [index('ledger_entries_tx_idx').on(t.txId), index('ledger_entries_acct_idx').on(t.account)]);

const payoutRequests = pgTable('payout_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  amount: numeric('amount', { precision: 19, scale: 4 }).notNull(),
  currency: varchar('currency', { length: 8 }).notNull(),
  kind: varchar('kind', { length: 32 }).notNull(), // commission | reward
  status: payoutStatus('status').notNull().default('requested'),
  destination: jsonb('destination').notNull().default({}), // bank/USDT-details (no private keys ever)
  approvedBy: uuid('approved_by').references(() => users.id),
  secondApprovedBy: uuid('second_approved_by').references(() => users.id),
  rejectReason: text('reject_reason'),
  idempotencyKey: varchar('idempotency_key', { length: 96 }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
const payoutEvents = pgTable('payout_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  payoutId: uuid('payout_id').notNull().references(() => payoutRequests.id, { onDelete: 'cascade' }),
  fromStatus: varchar('from_status', { length: 24 }),
  toStatus: varchar('to_status', { length: 24 }).notNull(),
  actorId: uuid('actor_id').references(() => users.id),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
const refunds = pgTable('refunds', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().references(() => orders.id),
  amount: numeric('amount', { precision: 19, scale: 4 }).notNull(),
  currency: varchar('currency', { length: 8 }).notNull(),
  reason: text('reason'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
const reconciliationRuns = pgTable('reconciliation_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  mismatches: integer('mismatches').notNull().default(0),
  report: jsonb('report').notNull().default({}),
});

const fxRates = pgTable('fx_rates', {
  id: uuid('id').primaryKey().defaultRandom(),
  base: varchar('base', { length: 8 }).notNull(),
  quote: varchar('quote', { length: 8 }).notNull(),
  rate: numeric('rate', { precision: 19, scale: 6 }).notNull(),
  source: varchar('source', { length: 48 }).notNull().default('manual'),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
});
const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  channel: varchar('channel', { length: 16 }).notNull().default('inapp'),
  title: varchar('title', { length: 160 }).notNull(),
  body: text('body'),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
const contentPages = pgTable('content_pages', {
  slug: varchar('slug', { length: 96 }).primaryKey(),
  title: varchar('title', { length: 160 }).notNull(),
  body: text('body').notNull().default(''),
  updatedBy: uuid('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
const systemSettings = pgTable('system_settings', {
  key: varchar('key', { length: 96 }).primaryKey(),
  value: jsonb('value').notNull(),
  updatedBy: uuid('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
const featureFlags = pgTable('feature_flags', {
  key: varchar('key', { length: 96 }).primaryKey(),
  enabled: boolean('enabled').notNull().default(false),
  description: text('description'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id').references(() => users.id),
  action: varchar('action', { length: 96 }).notNull(),
  targetType: varchar('target_type', { length: 64 }),
  targetId: text('target_id'),
  diff: jsonb('diff'),
  ip: varchar('ip', { length: 64 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('audit_actor_idx').on(t.actorId), index('audit_action_idx').on(t.action)]);
const fraudRiskEvents = pgTable('fraud_risk_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: varchar('kind', { length: 64 }).notNull(),
  userId: uuid('user_id').references(() => users.id),
  orderId: uuid('order_id').references(() => orders.id),
  detail: jsonb('detail').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---- Token-marketplace (simulated-token pilot) ----
const tokenDefinitions = pgTable('token_definitions', {
  code: varchar('code', { length: 32 }).primaryKey(),
  name: varchar('name', { length: 120 }).notNull(),
  kind: varchar('kind', { length: 24 }).notNull().default('SIMULATED'),
  totalSupply: numeric('total_supply', { precision: 19, scale: 4 }).notNull().default('0'),
  basis: text('basis').notNull().default(''),
  rights: text('rights').notNull().default(''),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
const pricingRules = pgTable('pricing_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  version: integer('version').notNull(),
  lockDays: integer('lock_days').notNull(),
  rateBpsPerDay: integer('rate_bps_per_day').notNull(),
  basis: varchar('basis', { length: 16 }).notNull().default('simple'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('pricing_rules_ver_lock_uidx').on(t.version, t.lockDays)]);
const tokenHoldings = pgTable('token_holdings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenCode: varchar('token_code', { length: 32 }).notNull().references(() => tokenDefinitions.code),
  qty: numeric('qty', { precision: 19, scale: 4 }).notNull(),
  costUsdt: numeric('cost_usdt', { precision: 19, scale: 4 }).notNull(),
  lockDays: integer('lock_days').notNull(),
  status: varchar('status', { length: 24 }).notNull().default('locked'),
  purchasedAt: timestamp('purchased_at', { withTimezone: true }).notNull().defaultNow(),
  maturesAt: timestamp('matures_at', { withTimezone: true }).notNull(),
  listingId: uuid('listing_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('token_holdings_user_idx').on(t.userId), index('token_holdings_status_idx').on(t.status)]);
const participationCycles = pgTable('participation_cycles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  holdingId: uuid('holding_id').notNull().references(() => tokenHoldings.id, { onDelete: 'cascade' }).unique(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  maturedAt: timestamp('matured_at', { withTimezone: true }),
  settledAt: timestamp('settled_at', { withTimezone: true }),
  status: varchar('status', { length: 24 }).notNull().default('started'),
  success: boolean('success').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('participation_cycles_user_idx').on(t.userId)]);
const stageDefinitions = pgTable('stage_definitions', {
  stage: integer('stage').primaryKey(),
  name: varchar('name', { length: 64 }).notNull(),
  minBuy: numeric('min_buy', { precision: 19, scale: 4 }),
  maxBuy: numeric('max_buy', { precision: 19, scale: 4 }),
  reqCycles7d: integer('req_cycles_7d').notNull().default(0),
  reqCycles14d: integer('req_cycles_14d').notNull().default(0),
  upgradeFee: numeric('upgrade_fee', { precision: 19, scale: 4 }),
  renewalFee: numeric('renewal_fee', { precision: 19, scale: 4 }),
});
const stageHistory = pgTable('stage_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  fromStage: integer('from_stage'),
  toStage: integer('to_stage').notNull(),
  kind: varchar('kind', { length: 24 }).notNull().default('assign'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('stage_history_user_idx').on(t.userId)]);
const stageRequests = pgTable('stage_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: varchar('kind', { length: 16 }).notNull(),
  fromStage: integer('from_stage').notNull(),
  toStage: integer('to_stage').notNull(),
  feeDisclosed: numeric('fee_disclosed', { precision: 19, scale: 4 }),
  status: varchar('status', { length: 24 }).notNull().default('pending'),
  idempotency: varchar('idempotency', { length: 96 }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('stage_requests_user_idx').on(t.userId)]);
const tokenListings = pgTable('token_listings', {
  id: uuid('id').primaryKey().defaultRandom(),
  holdingId: uuid('holding_id').notNull().references(() => tokenHoldings.id, { onDelete: 'cascade' }).unique(),
  sellerId: uuid('seller_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  totalQty: numeric('total_qty', { precision: 19, scale: 4 }).notNull(),
  remainingQty: numeric('remaining_qty', { precision: 19, scale: 4 }).notNull(),
  askUnitPrice: numeric('ask_unit_price', { precision: 19, scale: 4 }).notNull(),
  targetValue: numeric('target_value', { precision: 19, scale: 4 }).notNull(),
  status: varchar('status', { length: 24 }).notNull().default('open'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('token_listings_status_idx').on(t.status), index('token_listings_seller_idx').on(t.sellerId)]);
const tokenFills = pgTable('token_fills', {
  id: uuid('id').primaryKey().defaultRandom(),
  listingId: uuid('listing_id').notNull().references(() => tokenListings.id, { onDelete: 'cascade' }),
  buyerId: uuid('buyer_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  qty: numeric('qty', { precision: 19, scale: 4 }).notNull(),
  unitPrice: numeric('unit_price', { precision: 19, scale: 4 }).notNull(),
  total: numeric('total', { precision: 19, scale: 4 }).notNull(),
  idempotency: varchar('idempotency', { length: 96 }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('token_fills_listing_idx').on(t.listingId), index('token_fills_buyer_idx').on(t.buyerId)]);
const commissionCategories = pgTable('commission_categories', {
  id: varchar('id', { length: 32 }).primaryKey(),
  name: varchar('name', { length: 120 }).notNull(),
  description: text('description').notNull().default(''),
  rateBps: integer('rate_bps'),
  active: boolean('active').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

module.exports = {
  users, userProfiles, roles, permissions, userRoles, userSessions,
  identityChecks, consentRecords, serviceFees, servicePayments,
  listings, listingImages, orders, orderItems, paymentEvidence, paymentProviderEvents,
  disputes, supportTickets, supportMessages,
  referrals, referralClosure, commissionRules, commissionCalculations,
  rewardCampaigns, campaignEligibility, rewardCalculations,
  ledgerAccounts, ledgerTransactions, ledgerEntries,
  payoutRequests, payoutEvents, refunds, reconciliationRuns,
  fxRates, notifications, contentPages, systemSettings, featureFlags,
  auditLogs, fraudRiskEvents,
  tokenDefinitions, pricingRules, tokenHoldings, participationCycles,
  stageDefinitions, stageHistory, stageRequests, tokenListings, tokenFills,
  commissionCategories,
};
