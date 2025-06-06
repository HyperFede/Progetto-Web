// c:\Users\enric\Desktop\Uni\ProgettoWebClonedRepo\Progetto-Web\backend\src\middleware\queryBuilderMiddleware.js
const pool = require('../config/db-connect'); // Only if needed for validation, usually not.

/**
 * Creates a middleware function for building SQL query filters and sorting.
 * @param {object} config - Configuration for the query builder.
 * @param {Array<object>} config.allowedFilters - Array of allowed filter objects.
 *   Each filter object: { queryParam: string, dbColumn: string, type: 'exact'|'like'|'gte'|'lte'|'boolean', dataType?: 'string'|'number'|'integer'|'boolean' }
 * @param {Array<string>} config.allowedSortFields - Array of database column names allowed for sorting.
 * @param {string} config.defaultSortField - Default field to sort by if not specified.
 * @param {'ASC'|'DESC'} [config.defaultSortOrder='ASC'] - Default sort order.
 * @param {number} [config.defaultLimit] - Default limit if not specified in query.
 * @param {number} [config.maxLimit=100] - Maximum allowed limit.
 * @param {string} [config.baseWhereClause=''] - A base WHERE clause to always include (e.g., 'deleted = FALSE').
 */
function createQueryBuilderMiddleware(config) {
    return function queryBuilder(req, res, next) {
        const queryParams = req.query;
        const whereClauses = [];
        const queryValues = [];
        let paramIndex = 1;

        // Start with the base WHERE clause if provided
        if (config.baseWhereClause) {
            whereClauses.push(`(${config.baseWhereClause})`);
        }

        // Build filter conditions
        if (config.allowedFilters && Array.isArray(config.allowedFilters)) {
            config.allowedFilters.forEach(filter => {
                if (queryParams[filter.queryParam] !== undefined) {
                    let value = queryParams[filter.queryParam];

                    // Basic type validation and casting
                    if (filter.dataType === 'number') {
                        value = parseFloat(value);
                        if (isNaN(value)) return; // Skip if not a valid number
                    } else if (filter.dataType === 'integer') {
                        value = parseInt(value, 10);
                        if (isNaN(value)) return; // Skip if not a valid integer
                    } else if (filter.dataType === 'boolean') {
                        if (value === 'true') value = true;
                        else if (value === 'false') value = false;
                        else return; // Skip if not 'true' or 'false'
                    }


                    switch (filter.type) {
                        case 'exact':
                            whereClauses.push(`${filter.dbColumn} = $${paramIndex++}`);
                            queryValues.push(value);
                            break;
                        case 'like': // Case-insensitive like
                            whereClauses.push(`${filter.dbColumn} ILIKE $${paramIndex++}`);
                            queryValues.push(`%${value}%`);
                            break;
                        case 'gte': // Greater than or equal
                            whereClauses.push(`${filter.dbColumn} >= $${paramIndex++}`);
                            queryValues.push(value);
                            break;
                        case 'lte': // Less than or equal
                            whereClauses.push(`${filter.dbColumn} <= $${paramIndex++}`);
                            queryValues.push(value);
                            break;
                        case 'boolean':
                             whereClauses.push(`${filter.dbColumn} = $${paramIndex++}`);
                             queryValues.push(value);
                             break;
                        // Add more types as needed (e.g., 'in', 'date_range')
                    }
                }
            });
        }

        // Attach WHERE clause and values to request
        req.sqlWhereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
        req.sqlQueryValues = queryValues;

        // Build sort conditions
        const sortBy = queryParams.sort && config.allowedSortFields.includes(queryParams.sort.toLowerCase())
            ? queryParams.sort.toLowerCase() // Ensure column name is safe
            : config.defaultSortField;

        let sortOrder = config.defaultSortOrder || 'ASC';
        if (queryParams.order && queryParams.order.toUpperCase() === 'DESC') {
            sortOrder = 'DESC';
        }
        // Ensure sortBy is a valid column name before direct concatenation
        // The check against allowedSortFields handles this.
        req.sqlOrderByClause = `ORDER BY ${sortBy} ${sortOrder}`;

        // Build LIMIT and OFFSET clauses
        req.sqlLimitClause = '';
        req.sqlOffsetClause = '';

        let limit = config.defaultLimit;
        if (queryParams.limit !== undefined) {
            const requestedLimit = parseInt(queryParams.limit, 10);
            if (!isNaN(requestedLimit) && requestedLimit > 0) {
                limit = Math.min(requestedLimit, config.maxLimit || 100); // Use maxLimit or default to 100
            } else if (requestedLimit === 0) { // Allow 0 to mean no limit if desired, or handle as invalid
                limit = undefined; // No limit
            }
        }

        if (limit !== undefined && limit > 0) {
            req.sqlQueryValues.push(limit);
            req.sqlLimitClause = `LIMIT $${req.sqlQueryValues.length}`;

            let offset = 0;
            if (queryParams.offset !== undefined) {
                const requestedOffset = parseInt(queryParams.offset, 10);
                if (!isNaN(requestedOffset) && requestedOffset >= 0) {
                    offset = requestedOffset;
                }
            } else if (queryParams.page !== undefined) {
                const requestedPage = parseInt(queryParams.page, 10);
                if (!isNaN(requestedPage) && requestedPage > 0) {
                    offset = (requestedPage - 1) * limit;
                }
            }
            if (offset >= 0) { // Offset can be 0
                req.sqlQueryValues.push(offset);
                req.sqlOffsetClause = `OFFSET $${req.sqlQueryValues.length}`;
            }
        }

        next();
    };
}

module.exports = { createQueryBuilderMiddleware };
