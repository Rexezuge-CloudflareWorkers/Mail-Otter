export * from './ConfigurationDefaults';
export * from './ConfigurationManager';
// Aliased rather than re-exported under its own name: `MailOtterConfig` is the
// project's configuration surface, but `AppConfiguration` is the name every
// service in the repo already injects by, and renaming the type across 30 call
// sites would buy nothing.
export { MailOtterConfig as AppConfiguration } from './MailOtterConfig';
export { EnvParser } from '@rexezuge/runtime';
export type { ServiceEnv } from './ServiceEnv';
