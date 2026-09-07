import type { D1Queryable } from '../utils';
import { executeD1WithRetry } from '../utils/D1Utils';

abstract class BaseDAO {
  constructor(protected readonly database: D1Queryable) {}

  protected withRetry(operation: () => Promise<D1Result>, context: string): Promise<D1Result> {
    return executeD1WithRetry(operation, context);
  }
}

abstract class EncryptedDAO extends BaseDAO {
  constructor(database: D1Queryable, protected readonly masterKey: string) {
    super(database);
  }
}

export { BaseDAO, EncryptedDAO };
