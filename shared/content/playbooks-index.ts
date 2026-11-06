import type { Playbook } from "../types.js";
import { accountPlaybooks } from "./playbooks-accounts.js";
import { fraudPlaybooks } from "./playbooks-money.js";
import { devicePlaybooks } from "./playbooks-devices.js";
import { peoplePlaybooks } from "./playbooks-people.js";

export const allPlaybooks: Playbook[] = [
  ...accountPlaybooks,
  ...fraudPlaybooks,
  ...devicePlaybooks,
  ...peoplePlaybooks,
];

export const getPlaybook = (id: string): Playbook | undefined =>
  allPlaybooks.find((p) => p.id === id);

export const playbookCategories = (): string[] =>
  Array.from(new Set(allPlaybooks.map((p) => p.category)));

export { accountPlaybooks, fraudPlaybooks, devicePlaybooks, peoplePlaybooks };
