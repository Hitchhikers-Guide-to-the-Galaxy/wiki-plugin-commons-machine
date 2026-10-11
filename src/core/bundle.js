// The formula bundle and the role manifest. Formulas are the package's
// commons-model.yaml (0.1.0) plus the Phase 1 covenant cost (0.2.0). Every
// declared value reaches the bundle through a Method label, so the wiki page
// stays the source and this file only names the correspondence.
export const FORMULA_VERSION = '0.2.0'

export const FORMULAS = {
  sellable_hours_month: 'rig.calendar_hours_month * rig.uptime_fraction * rig.allocatable_fraction',
  guaranteed_entitlement_hours: 'membership.count * membership.guaranteed_hours_member_month',
  expected_hours_member: 'membership.guaranteed_hours_member_month * membership.guaranteed_use_fraction + membership.flex_hours_member_month * membership.flex_use_fraction',
  expected_hours_month: 'membership.count * expected_hours_member',
  revenue_gbp_month: 'membership.count * membership.contribution_gbp_month',
  capital_reserve_gbp_month: 'rig.capital_gbp / rig.recovery_months',
  electricity_gbp_month: 'rig.calendar_hours_month * rig.idle_power_kw * operations.electricity_gbp_kwh + expected_hours_month * (rig.active_power_kw - rig.idle_power_kw) * operations.electricity_gbp_kwh',
  maintenance_gbp_month: 'rig.capital_gbp * rig.maintenance_fraction_year / 12',
  fixed_operations_gbp_month: 'operations.network_gbp_month + operations.storage_backup_gbp_month + operations.administration_insurance_gbp_month + operations.operator_labour_gbp_month + operations.contingency_gbp_month',
  payment_fees_gbp_month: 'revenue_gbp_month * operations.payment_fee_fraction_revenue',
  fully_loaded_cost_gbp_month: 'capital_reserve_gbp_month + electricity_gbp_month + maintenance_gbp_month + fixed_operations_gbp_month + payment_fees_gbp_month',
  shortfall_fraction: 'max(0, (guaranteed_entitlement_hours - sellable_hours_month) / sellable_hours_month)',
  unmet_hours_month: 'shortfall_fraction * sellable_hours_month',
  credit_rate_gbp_hour: 'membership.contribution_gbp_month / membership.guaranteed_hours_member_month',
  covenant_credit_gbp_month: 'unmet_hours_month * credit_rate_gbp_hour',
  surplus_gbp_month: 'revenue_gbp_month - covenant_credit_gbp_month - fully_loaded_cost_gbp_month',
  surplus_margin: 'surplus_gbp_month / revenue_gbp_month',
  expected_capacity_fraction: 'expected_hours_month / sellable_hours_month',
  entitlement_capacity_fraction: 'guaranteed_entitlement_hours / sellable_hours_month',
  three_year_surplus_gbp: 'surplus_gbp_month * rig.recovery_months',
  cost_per_sellable_hour_gbp: 'fully_loaded_cost_gbp_month / sellable_hours_month',
  cost_per_expected_hour_gbp: 'fully_loaded_cost_gbp_month / expected_hours_month',
  price_per_expected_hour_gbp: 'membership.contribution_gbp_month / expected_hours_member',
}

// Method label (units and all) -> canonical key, grouped by the role that declares it.
export const ROLES = {
  'compute-rig': { cardinality: 'one', labels: {
    'Capital (GBP)': 'rig.capital_gbp', 'Recovery (Month)': 'rig.recovery_months',
    'Calendar Hours (Hour / Month)': 'rig.calendar_hours_month', 'Uptime Fraction': 'rig.uptime_fraction',
    'Allocatable Fraction': 'rig.allocatable_fraction', 'Idle Power (kWh / Hour)': 'rig.idle_power_kw',
    'Active Power (kWh / Hour)': 'rig.active_power_kw', 'Maintenance Rate (GBP / GBP Year)': 'rig.maintenance_fraction_year',
    'Months per Year (Month / Year)': 'rig.months_per_year', 'Memory (GB)': 'rig.memory_gb' } },
  'membership-covenant': { cardinality: 'one', labels: {
    'Members': 'membership.count', 'Contribution (GBP / Month)': 'membership.contribution_gbp_month',
    'Guaranteed Hours (Hour / Month)': 'membership.guaranteed_hours_member_month', 'Flex Hours (Hour / Month)': 'membership.flex_hours_member_month' } },
  'operating-costs': { cardinality: 'one', labels: {
    'Electricity Tariff (GBP / kWh)': 'operations.electricity_gbp_kwh', 'Network (GBP / Month)': 'operations.network_gbp_month',
    'Storage and Backup (GBP / Month)': 'operations.storage_backup_gbp_month', 'Administration and Insurance (GBP / Month)': 'operations.administration_insurance_gbp_month',
    'Operator Labour (GBP / Month)': 'operations.operator_labour_gbp_month', 'Contingency (GBP / Month)': 'operations.contingency_gbp_month',
    'Payment Fee Fraction': 'operations.payment_fee_fraction_revenue' } },
  'demand-profile': { cardinality: 'zero-or-one', labels: {
    'UseGuaranteed Fraction': 'membership.guaranteed_use_fraction', 'UseFlex Fraction': 'membership.flex_use_fraction' } },
  'commons-policy': { cardinality: 'one', labels: {
    'Target Surplus Margin': 'policy.target_surplus_margin', 'Entitlement Must Fit Sellable Capacity': 'policy.entitlement_must_fit_sellable_capacity' } },
  'cloud-benchmarks': { cardinality: 'zero-or-more', labels: {} },   // recognised by its table, not by labels
  'scenario-overrides': { cardinality: 'zero-or-one', labels: {} },  // recognised by title; may carry any label above
}
export const LABEL_TO_KEY = Object.fromEntries(Object.values(ROLES).flatMap(r => Object.entries(r.labels)))
export const KEY_TO_LABEL = Object.fromEntries(Object.entries(LABEL_TO_KEY).map(([l, k]) => [k, l]))
export const ROLE_OF_KEY = Object.fromEntries(Object.entries(ROLES).flatMap(([role, r]) => Object.values(r.labels).map(k => [k, role])))

export const MANIFEST = {
  type: 'commons-machine', name: 'compute-commons', version: '0.1.0', scope: 'lineup-left',
  requires: Object.entries(ROLES).map(([role, r]) => ({ role, cardinality: r.cardinality })),
  conflicts: 'error', overrides: 'explicit-role-only',
  controls: [
    { key: 'membership.count', kind: 'range', min: 12, max: 50, step: 1 },
    { key: 'membership.contribution_gbp_month', kind: 'range', min: 10, max: 40, step: 1 },
    { key: 'rig.configuration', kind: 'select' },
  ],
  sweeps: [
    { key: 'membership.count', values: [18, 24, 30, 33, 36, 42, 43, 44, 50] },
    { key: 'membership.contribution_gbp_month', values: [15, 18, 21, 24, 28] },
    { key: 'rig.uptime_fraction', values: ['0.7', '0.8', '0.9', '0.95'] },
  ],
  freshness: { warn_days: 35, refuse_days: 90 },
}

// Named configurations the select offers besides "as declared".
export const SCENARIOS = [
  { id: 'mac-studio-512gb-planning-case', title: '512GB planning case (unpriced estimate)', overrides: { 'rig.capital_gbp': '15999', 'membership.contribution_gbp_month': '28', 'rig.memory_gb': '512' } },
]

export const OUTPUTS = [
  ['sellable_hours_month', 'Sellable hours / month', 'h', 1], ['guaranteed_entitlement_hours', 'Guaranteed entitlement', 'h', 1],
  ['expected_hours_month', 'Expected demand', 'h', 1], ['expected_capacity_fraction', 'Expected capacity', '%', 1],
  ['entitlement_capacity_fraction', 'Entitlement capacity', '%', 1], ['revenue_gbp_month', 'Revenue / month', '£', 2],
  ['covenant_credit_gbp_month', 'Covenant credit / month', '£', 2], ['fully_loaded_cost_gbp_month', 'Fully loaded cost / month', '£', 2],
  ['surplus_gbp_month', 'Surplus / month', '£', 2], ['surplus_margin', 'Surplus margin', '%', 1],
  ['three_year_surplus_gbp', 'Three-year surplus', '£', 2], ['price_per_expected_hour_gbp', 'Member price / expected hour', '£', 2],
  ['cost_per_expected_hour_gbp', 'Cost / expected hour', '£', 2],
]
export const COST_LINES = [
  ['capital_reserve_gbp_month', 'Capital reserve'], ['electricity_gbp_month', 'Electricity'], ['maintenance_gbp_month', 'Maintenance'],
  ['fixed_operations_gbp_month', 'Fixed operations'], ['payment_fees_gbp_month', 'Payment fees'], ['covenant_credit_gbp_month', 'Covenant credit'],
]
