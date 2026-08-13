/**
 * DI token for the {@link LinkRepository} abstraction. Controllers/services
 * depend on the interface via this token; the concrete in-memory implementation
 * is bound in the module. This keeps the feature layer decoupled from the
 * data-access implementation (a durable repo can be swapped in without changes).
 */
export const LINK_REPOSITORY = Symbol('LINK_REPOSITORY');
