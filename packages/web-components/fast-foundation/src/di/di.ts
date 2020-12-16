/**
 * Big thanks to https://github.com/EisenbergEffect and the https://github.com/aurelia/aurelia project
 * for this code.
 */
import {
    Constructable,
    Controller,
    emptyArray,
    FASTElement,
    Observable,
} from "@microsoft/fast-element";
import { Class } from "../interfaces";

// Tiny polyfill for TypeScript's Reflect metadata API.
const metadataByTarget = new Map<any, Map<any, any>>();

if (!("metadata" in Reflect)) {
    (Reflect as any).metadata = function (key: any, value: any) {
        return function (target: any) {
            (Reflect as any).defineMetadata(key, value, target);
        };
    };

    (Reflect as any).defineMetadata = function (key: any, value: any, target: any) {
        let metadata = metadataByTarget.get(target);

        if (metadata === void 0) {
            metadataByTarget.set(target, (metadata = new Map()));
        }

        metadata.set(key, value);
    };

    (Reflect as any).getOwnMetadata = function (key: any, target: any): any {
        const metadata = metadataByTarget.get(target);

        if (metadata !== void 0) {
            return metadata.get(key);
        }

        return void 0;
    };
}

/**
 * @alpha
 */
export type Injectable<T = {}> = Constructable<T> & { inject?: Key[] };

/**
 * @alpha
 */
export type ResolveCallback<T = any> = (
    handler: Container,
    requestor: Container,
    resolver: Resolver<T>
) => T;

/**
 * @alpha
 */
export type InterfaceSymbol<Key = any, TBase extends {} = {}> = (
    target: TBase,
    property: string,
    index?: number
) => void;

/**
 * @alpha
 */
export interface DefaultableInterfaceSymbol<Key, Type = any>
    extends InterfaceSymbol<Key, Type> {
    withDefault(
        configure: (builder: ResolverBuilder<Key>) => Resolver<Key>
    ): InterfaceSymbol<Key, Type>;
    noDefault(): InterfaceSymbol<Key, Type>;
}

type InternalDefaultableInterfaceSymbol<K, T = any> = DefaultableInterfaceSymbol<K, T> &
    Partial<
        Registration<K> & {
            friendlyName: string;
            $isInterface: true;
        }
    >;

// This interface exists only to break a circular type referencing issue in the IServiceLocator interface.
// Otherwise IServiceLocator references IResolver, which references IContainer, which extends IServiceLocator.
interface ResolverLike<C, K = any> {
    readonly $isResolver: true;
    resolve(handler: C, requestor: C): Resolved<K>;
    getFactory?(container: C): (K extends Constructable ? Factory<K> : never) | null;
}

/**
 * @alpha
 */
/* eslint-disable-next-line */
export interface Resolver<K = any> extends ResolverLike<Container, K> {}

/**
 * @alpha
 */
export interface Registration<K = any> {
    register(container: Container, key?: Key): Resolver<K>;
}

/**
 * @alpha
 */
export type Transformer<K> = (instance: Resolved<K>) => Resolved<K>;

/**
 * @alpha
 */
export interface Factory<T extends Constructable = any> {
    readonly Type: T;
    registerTransformer(transformer: Transformer<T>): boolean;
    construct(container: Container, dynamicDependencies?: Key[]): Resolved<T>;
}

/**
 * @alpha
 */
export interface ServiceLocator {
    has<K extends Key>(key: K | Key, searchAncestors: boolean): boolean;
    get<K extends Key>(key: K): Resolved<K>;
    get<K extends Key>(key: Key): Resolved<K>;
    get<K extends Key>(key: K | Key): Resolved<K>;
    getAll<K extends Key>(key: K, searchAncestors?: boolean): readonly Resolved<K>[];
    getAll<K extends Key>(key: Key, searchAncestors?: boolean): readonly Resolved<K>[];
    getAll<K extends Key>(
        key: K | Key,
        searchAncestors?: boolean
    ): readonly Resolved<K>[];
}

/**
 * @alpha
 */
export interface Registry {
    register(container: Container, ...params: unknown[]): void | Resolver | Container;
}

/**
 * @alpha
 */
export interface Container extends ServiceLocator {
    register(...params: any[]): Container;
    registerResolver<K extends Key, T = K>(key: K, resolver: Resolver<T>): Resolver<T>;
    registerTransformer<K extends Key, T = K>(
        key: K,
        transformer: Transformer<T>
    ): boolean;
    getResolver<K extends Key, T = K>(
        key: K | Key,
        autoRegister?: boolean
    ): Resolver<T> | null;
    registerFactory<T extends Constructable>(key: T, factory: Factory<T>): void;
    getFactory<T extends Constructable>(key: T): Factory<T> | null;
    createChild(
        config?: Partial<Omit<ContainerConfiguration, "parentLocator">>
    ): Container;
}

/**
 * @alpha
 */
export type RegisterSelf<T extends Constructable> = {
    register(container: Container): Resolver<InstanceType<T>>;
    registerInRequestor: boolean;
};

/**
 * @alpha
 */
export type Key = PropertyKey | object | InterfaceSymbol | Constructable | Resolver;

/**
 * @alpha
 */
export type Resolved<K> = K extends InterfaceSymbol<infer T>
    ? T
    : K extends Constructable
    ? InstanceType<K>
    : K extends ResolverLike<any, infer T1>
    ? T1 extends Constructable
        ? InstanceType<T1>
        : T1
    : K;
/**
 * @alpha
 */
export const enum ResolverStrategy {
    instance = 0,
    singleton = 1,
    transient = 2,
    callback = 3,
    array = 4,
    alias = 5,
}

const cache = new WeakMap<Resolver>();

function cacheCallbackResult<T>(fun: ResolveCallback<T>): ResolveCallback<T> {
    return function (handler: Container, requestor: Container, resolver: Resolver): T {
        if (cache.has(resolver)) {
            return cache.get(resolver);
        }

        const t = fun(handler, requestor, resolver);
        cache.set(resolver, t);

        return t;
    };
}

const isNumericLookup: Record<string, boolean> = {};

function isArrayIndex(value: unknown): value is number | string {
    switch (typeof value) {
        case "number":
            return value >= 0 && (value | 0) === value;
        case "string": {
            const result = isNumericLookup[value];
            if (result !== void 0) {
                return result;
            }
            const length = value.length;
            if (length === 0) {
                return (isNumericLookup[value] = false);
            }
            let ch = 0;
            for (let i = 0; i < length; ++i) {
                ch = value.charCodeAt(i);
                if (
                    (i === 0 && ch === 0x30 && length > 1) /* must not start with 0 */ ||
                    ch < 0x30 /* 0 */ ||
                    ch > 0x39 /* 9 */
                ) {
                    return (isNumericLookup[value] = false);
                }
            }
            return (isNumericLookup[value] = true);
        }
        default:
            return false;
    }
}

function cloneArrayWithPossibleProps<T>(source: readonly T[]): T[] {
    const clone = source.slice();
    const keys = Object.keys(source);
    const len = keys.length;
    let key: string;
    for (let i = 0; i < len; ++i) {
        key = keys[i];
        if (!isArrayIndex(key)) {
            clone[key] = source[key];
        }
    }
    return clone;
}

/**
 * @alpha
 */
export class ResolverBuilder<K> {
    public constructor(private container: Container, private key: Key) {}

    public instance(value: K): Resolver<K> {
        return this.registerResolver(ResolverStrategy.instance, value);
    }

    public singleton(value: Constructable): Resolver<K> {
        return this.registerResolver(ResolverStrategy.singleton, value);
    }

    public transient(value: Constructable): Resolver<K> {
        return this.registerResolver(ResolverStrategy.transient, value);
    }

    public callback(value: ResolveCallback<K>): Resolver<K> {
        return this.registerResolver(ResolverStrategy.callback, value);
    }

    public cachedCallback(value: ResolveCallback<K>): Resolver<K> {
        return this.registerResolver(
            ResolverStrategy.callback,
            cacheCallbackResult(value)
        );
    }

    public aliasTo(destinationKey: Key): Resolver<K> {
        return this.registerResolver(ResolverStrategy.alias, destinationKey);
    }

    private registerResolver(strategy: ResolverStrategy, state: unknown): Resolver<K> {
        const { container, key } = this;
        this.container = this.key = (void 0)!;
        return container.registerResolver(key, new ResolverImpl(key, strategy, state));
    }
}

const dependencyLookup = new Map<Constructable | Injectable, Key[]>();

/**
 * @alpha
 */
export type ParentLocator = (owner: any) => Container | null;

const DILocateParentEventType = "__DI_LOCATE_PARENT__";
const defaultFriendlyName = "(anonymous)";

/**
 * @alpha
 */
export interface DOMParentLocatorEventDetail {
    container: Container | void;
}

function domParentLocator(element: HTMLElement): Container {
    const event = new CustomEvent<DOMParentLocatorEventDetail>(DILocateParentEventType, {
        bubbles: true,
        composed: true,
        cancelable: true,
        detail: { container: void 0 },
    });

    element.dispatchEvent(event);

    return event.detail.container || DI.getOrCreateDOMContainer();
}
/**
 * @alpha
 */
export interface InterfaceConfiguration {
    /**
     * The friendly name for the interface. Useful for debugging.
     */
    friendlyName?: string;

    /**
     * When true, the dependency will be re-resolved when FASTElement connection changes.
     * If the resolved value changes due to connection change, a {@link @microsoft/fast-element#Observable.notify | notification }
     * will be emitted for the property, with the previous and next values provided to any subscriber.
     */
    respectConnection?: boolean;
}

function createInterface<K extends Key, T = any>(
    friendlyName?: string
): DefaultableInterfaceSymbol<K, T>;
function createInterface<K extends Key, T = any>(
    configuration?: InterfaceConfiguration & { respectConnection: false }
): DefaultableInterfaceSymbol<K, T>;
function createInterface<K extends Key, T = HTMLElement & FASTElement>(
    configuration?: InterfaceConfiguration & { respectConnection: true }
): DefaultableInterfaceSymbol<K, T>;
function createInterface<K extends Key, T = any>(nameOrConfig?: any) {
    const friendlyName: string =
        typeof nameOrConfig === "string"
            ? nameOrConfig
            : nameOrConfig?.friendlyName || defaultFriendlyName;
    const respectConnection: boolean =
        typeof nameOrConfig !== "string" ? !!nameOrConfig?.respectConnection : false;
    const Interface: InternalDefaultableInterfaceSymbol<K> = function (
        target: Injectable<T>,
        property: string,
        index: number
    ): any {
        if (target === null || new.target !== undefined) {
            throw new Error(`No registration for interface: '${Interface.friendlyName}'`);
        }

        if (property) {
            const diPropertyKey = `$di_${property}`;

            Reflect.defineProperty(target, property, {
                get: function (this: T) {
                    let value = this[diPropertyKey];

                    if (value === void 0) {
                        const container: Container =
                            this instanceof HTMLElement
                                ? domParentLocator(this)
                                : DI.getOrCreateDOMContainer();

                        value = container.get(Interface);
                        this[diPropertyKey] = value;

                        if (respectConnection && this instanceof FASTElement) {
                            const notifier = Observable.getNotifier(
                                ((this as unknown) as FASTElement).$fastController
                            );
                            const handleChange = (
                                source: Controller,
                                key: "isConnected"
                            ): void => {
                                const newContainer = domParentLocator(
                                    (this as unknown) as HTMLElement
                                );
                                const newValue = newContainer.get(Interface) as any;
                                const oldValue = this[diPropertyKey];

                                if (newValue !== oldValue) {
                                    this[diPropertyKey] = value;
                                    Observable.getNotifier(this).notify({
                                        property,
                                        previous: oldValue,
                                        next: newValue,
                                    });
                                }
                            };

                            notifier.subscribe({ handleChange }, "isConnected");
                        }
                    }
                    return value;
                },
            });
        } else {
            const annotationParamtypes = DI.getOrCreateAnnotationParamTypes(target);
            annotationParamtypes[index] = Interface;
        }

        return target;
    } as any;

    Interface.$isInterface = true;
    Interface.friendlyName = friendlyName == null ? defaultFriendlyName : friendlyName;

    Interface.noDefault = function (): InterfaceSymbol<K, T> {
        return Interface;
    };

    Interface.withDefault = function (
        configure: (builder: ResolverBuilder<K>) => Resolver<K>
    ): InterfaceSymbol<K, T> {
        Interface.withDefault = function (): InterfaceSymbol<K, T> {
            throw new Error(
                `You can only define one default implementation for an interface: ${Interface}.`
            );
        };

        Interface.register = function (container: Container, key?: Key): Resolver<K> {
            return configure(new ResolverBuilder(container, key ?? Interface));
        };

        return Interface;
    };

    Interface.toString = function toString(): string {
        return `InterfaceSymbol<${Interface.friendlyName}>`;
    };

    return Interface;
}

export interface ContainerConfiguration {
    parentLocator: ParentLocator;
    defaultResolver(key: Key, handler: Container): Resolver;
}

export const DefaultResolver = {
    none(key: Key): Resolver {
        throw Error(
            `${key.toString()} not registered, did you forget to add @singleton()?`
        );
    },
    singleton(key: Key): Resolver {
        return new ResolverImpl(key, ResolverStrategy.singleton, key);
    },
    transient(key: Key): Resolver {
        return new ResolverImpl(key, ResolverStrategy.transient, key);
    },
};

export const ContainerConfiguration = Object.freeze({
    default: Object.freeze({
        parentLocator: () => null,
        defaultResolver: DefaultResolver.singleton,
    }),
});

/**
 * @alpha
 */
export const DI = Object.freeze({
    createContainer(config?: Partial<ContainerConfiguration>): Container {
        return new ContainerImpl(
            null,
            Object.assign({}, ContainerConfiguration.default, config)
        );
    },

    getOrCreateDOMContainer(
        element: HTMLElement = document.body,
        config?: Partial<Omit<ContainerConfiguration, "parentLocator">>
    ): Container {
        return (
            (element as any).$container ||
            new ContainerImpl(
                element,
                Object.assign({}, ContainerConfiguration.default, config, {
                    parentLocator:
                        element === document.body ? () => null : domParentLocator,
                })
            )
        );
    },

    createInterface,
    getDesignParamtypes(Type: Constructable | Injectable): readonly Key[] | undefined {
        return (Reflect as any).getOwnMetadata("design:paramtypes", Type);
    },

    getAnnotationParamtypes(
        Type: Constructable | Injectable
    ): readonly Key[] | undefined {
        return (Reflect as any).getOwnMetadata("di:paramtypes", Type);
    },

    getOrCreateAnnotationParamTypes(Type: Constructable | Injectable): Key[] {
        let annotationParamtypes = (Reflect as any).getOwnMetadata("di:paramtypes", Type);

        if (annotationParamtypes === void 0) {
            (Reflect as any).defineMetadata(
                "di:paramtypes",
                (annotationParamtypes = []),
                Type
            );
        }

        return annotationParamtypes;
    },

    getDependencies(Type: Constructable | Injectable): Key[] {
        // Note: Every detail of this getDependencies method is pretty deliberate at the moment, and probably not yet 100% tested from every possible angle,
        // so be careful with making changes here as it can have a huge impact on complex end user apps.
        // Preferably, only make changes to the dependency resolution process via a RFC.

        let dependencies = dependencyLookup.get(Type);

        if (dependencies === void 0) {
            // Type.length is the number of constructor parameters. If this is 0, it could mean the class has an empty constructor
            // but it could also mean the class has no constructor at all (in which case it inherits the constructor from the prototype).

            // Non-zero constructor length + no paramtypes means emitDecoratorMetadata is off, or the class has no decorator.
            // We're not doing anything with the above right now, but it's good to keep in mind for any future issues.

            const inject = (Type as Injectable).inject;

            if (inject === void 0) {
                // design:paramtypes is set by tsc when emitDecoratorMetadata is enabled.
                const designParamtypes = DI.getDesignParamtypes(Type);
                // au:annotation:di:paramtypes is set by the parameter decorator from DI.createInterface or by @inject
                const annotationParamtypes = DI.getAnnotationParamtypes(Type);
                if (designParamtypes === void 0) {
                    if (annotationParamtypes === void 0) {
                        // Only go up the prototype if neither static inject nor any of the paramtypes is defined, as
                        // there is no sound way to merge a type's deps with its prototype's deps
                        const Proto = Object.getPrototypeOf(Type);
                        if (typeof Proto === "function" && Proto !== Function.prototype) {
                            dependencies = cloneArrayWithPossibleProps(
                                DI.getDependencies(Proto)
                            );
                        } else {
                            dependencies = [];
                        }
                    } else {
                        // No design:paramtypes so just use the au:annotation:di:paramtypes
                        dependencies = cloneArrayWithPossibleProps(annotationParamtypes);
                    }
                } else if (annotationParamtypes === void 0) {
                    // No au:annotation:di:paramtypes so just use the design:paramtypes
                    dependencies = cloneArrayWithPossibleProps(designParamtypes);
                } else {
                    // We've got both, so merge them (in case of conflict on same index, au:annotation:di:paramtypes take precedence)
                    dependencies = cloneArrayWithPossibleProps(designParamtypes);
                    let len = annotationParamtypes.length;
                    let auAnnotationParamtype: Key;
                    for (let i = 0; i < len; ++i) {
                        auAnnotationParamtype = annotationParamtypes[i];
                        if (auAnnotationParamtype !== void 0) {
                            dependencies[i] = auAnnotationParamtype;
                        }
                    }

                    const keys = Object.keys(annotationParamtypes);
                    len = keys.length;
                    let key: string;
                    for (let i = 0; i < len; ++i) {
                        key = keys[i];
                        if (!isArrayIndex(key)) {
                            dependencies[key] = annotationParamtypes[key];
                        }
                    }
                }
            } else {
                // Ignore paramtypes if we have static inject
                dependencies = cloneArrayWithPossibleProps(inject);
            }

            dependencyLookup.set(Type, dependencies);
        }

        return dependencies;
    },

    inject(
        ...dependencies: Key[]
    ): (
        target: Injectable,
        key?: string | number,
        descriptor?: PropertyDescriptor | number
    ) => void {
        return function (
            target: Injectable,
            key?: string | number,
            descriptor?: PropertyDescriptor | number
        ): void {
            if (typeof descriptor === "number") {
                // It's a parameter decorator.
                const annotationParamtypes = DI.getOrCreateAnnotationParamTypes(target);
                const dep = dependencies[0];
                if (dep !== void 0) {
                    annotationParamtypes[descriptor] = dep;
                }
            } else if (key) {
                // It's a property decorator. Not supported by the container without plugins.
                const annotationParamtypes = DI.getOrCreateAnnotationParamTypes(
                    ((target as unknown) as { constructor: Injectable }).constructor
                );
                const dep = dependencies[0];
                if (dep !== void 0) {
                    annotationParamtypes[key as number] = dep;
                }
            } else if (descriptor) {
                // It's a function decorator (not a Class constructor)
                const fn = descriptor.value;
                const annotationParamtypes = DI.getOrCreateAnnotationParamTypes(fn);
                let dep: Key;
                for (let i = 0; i < dependencies.length; ++i) {
                    dep = dependencies[i];
                    if (dep !== void 0) {
                        annotationParamtypes[i] = dep;
                    }
                }
            } else {
                // It's a class decorator.
                const annotationParamtypes = DI.getOrCreateAnnotationParamTypes(target);
                let dep: Key;
                for (let i = 0; i < dependencies.length; ++i) {
                    dep = dependencies[i];
                    if (dep !== void 0) {
                        annotationParamtypes[i] = dep;
                    }
                }
            }
        };
    },

    /**
     * Registers the `target` class as a singleton dependency; the class will only be created once. Each
     * consecutive time the dependency is resolved, the same instance will be returned.
     *
     * @param target - The class / constructor function to register as a singleton.
     * @returns The same class, with a static `register` method that takes a container and returns the appropriate resolver.
     * @example ```ts
     * // On an existing class
     * class Foo { }
     * DI.singleton(Foo);
     *
     * // Inline declaration
     * const Foo = DI.singleton(class { });
     * // Foo is now strongly typed with register
     * Foo.register(container);
     * ```
     */
    singleton<T extends Constructable>(
        target: T & Partial<RegisterSelf<T>>,
        options: SingletonOptions = defaultSingletonOptions
    ): T & RegisterSelf<T> {
        target.register = function register(
            container: Container
        ): Resolver<InstanceType<T>> {
            const registration = Registration.singleton(target, target);
            return registration.register(container, target);
        };
        target.registerInRequestor = options.scoped;
        return target as T & RegisterSelf<T>;
    },
});

/**
 * @alpha
 */
export const inject = DI.inject;

/**
 * @alpha
 */
export const Container = DI.createInterface<Container>("Container").noDefault();

/**
 * @alpha
 */
export const ServiceLocator = (Container as unknown) as InterfaceSymbol<ServiceLocator>;

function createResolver(
    getter: (key: any, handler: Container, requestor: Container) => any
): (key: any) => any {
    return function (key: any): ReturnType<typeof DI.inject> {
        const resolver: ReturnType<typeof DI.inject> &
            Partial<Pick<Resolver, "resolve">> & { $isResolver: true } = function (
            target: Injectable,
            property?: string | number,
            descriptor?: PropertyDescriptor | number
        ): void {
            DI.inject(resolver)(target, property, descriptor);
        };

        resolver.$isResolver = true;
        resolver.resolve = function (handler: Container, requestor: Container): any {
            return getter(key, handler, requestor);
        };

        return resolver;
    };
}

/**
 * Allows you to optionally inject a dependency depending on whether the [[`Key`]] is present, for example
 * ```ts
 * class Foo {
 *   constructor( @inject('mystring') public str: string = 'somestring' )
 * }
 * container.get(Foo); // throws
 * ```
 * would fail
 * ```ts
 * class Foo {
 *   constructor( @optional('mystring') public str: string = 'somestring' )
 * }
 * container.get(Foo).str // somestring
 * ```
 * if you use it without a default it will inject `undefined`, so rember to mark your input type as
 * possibly `undefined`!
 *
 * - @param key: [[`Key`]]
 *
 * see { @link DI.createInterface } on interactions with interfaces
 */
export const optional = createResolver(
    (key: Key, handler: Container, requestor: Container) => {
        if (requestor.has(key, true)) {
            return requestor.get(key);
        } else {
            return undefined;
        }
    }
);

type SingletonOptions = { scoped: boolean };
const defaultSingletonOptions = { scoped: false };

function singletonDecorator<T extends Constructable>(
    target: T & Partial<RegisterSelf<T>>
): T & RegisterSelf<T> {
    return DI.singleton(target);
}
/**
 * Registers the decorated class as a singleton dependency; the class will only be created once. Each
 * consecutive time the dependency is resolved, the same instance will be returned.
 *
 * @example ```ts
 * &#64;singleton()
 * class Foo { }
 * ```
 */
export function singleton<T extends Constructable>(): typeof singletonDecorator;
export function singleton<T extends Constructable>(
    options?: SingletonOptions
): typeof singletonDecorator;
/**
 * Registers the `target` class as a singleton dependency; the class will only be created once. Each
 * consecutive time the dependency is resolved, the same instance will be returned.
 *
 * @param target - The class / constructor function to register as a singleton.
 *
 * @example ```ts
 * &#64;singleton()
 * class Foo { }
 * ```
 */
export function singleton<T extends Constructable>(
    target: T & Partial<RegisterSelf<T>>
): T & RegisterSelf<T>;
export function singleton<T extends Constructable>(
    targetOrOptions?: (T & Partial<RegisterSelf<T>>) | SingletonOptions
): (T & RegisterSelf<T>) | typeof singletonDecorator {
    if (typeof targetOrOptions === "function") {
        return DI.singleton(targetOrOptions);
    }
    return function <T extends Constructable>($target: T) {
        return DI.singleton($target, targetOrOptions as SingletonOptions | undefined);
    };
}

function createAllResolver(
    getter: (
        key: any,
        handler: Container,
        requestor: Container,
        searchAncestors: boolean
    ) => readonly any[]
): (key: any, searchAncestors?: boolean) => ReturnType<typeof DI.inject> {
    return function (key: any, searchAncestors?: boolean): ReturnType<typeof DI.inject> {
        searchAncestors = !!searchAncestors;
        const resolver: ReturnType<typeof DI.inject> &
            Required<Pick<Resolver, "resolve">> & { $isResolver: true } = function (
            target: Injectable,
            property?: string | number,
            descriptor?: PropertyDescriptor | number
        ): void {
            DI.inject(resolver)(target, property, descriptor);
        };

        resolver.$isResolver = true;
        resolver.resolve = function (handler: Container, requestor: Container): any {
            return getter(key, handler, requestor, searchAncestors!);
        };

        return resolver;
    };
}

export const all = createAllResolver(
    (key: any, handler: Container, requestor: Container, searchAncestors: boolean) =>
        requestor.getAll(key, searchAncestors)
);

/**
 * Lazily inject a dependency depending on whether the [[`Key`]] is present at the time of function call.
 *
 * You need to make your argument a function that returns the type, for example
 * ```ts
 * class Foo {
 *   constructor( @lazy('random') public random: () => number )
 * }
 * const foo = container.get(Foo); // instanceof Foo
 * foo.random(); // throws
 * ```
 * would throw an exception because you haven't registered `'random'` before calling the method. This, would give you a
 * new [['Math.random()']] number each time.
 * ```ts
 * class Foo {
 *   constructor( @lazy('random') public random: () => random )
 * }
 * container.register(Registration.callback('random', Math.random ));
 * container.get(Foo).random(); // some random number
 * container.get(Foo).random(); // another random number
 * ```
 * `@lazy` does not manage the lifecycle of the underlying key. If you want a singleton, you have to register as a
 * `singleton`, `transient` would also behave as you would expect, providing you a new instance each time.
 *
 * - @param key [[`Key`]]
 * see { @link DI.createInterface } on interactions with interfaces
 */
export const lazy = createResolver(
    (key: Key, handler: Container, requestor: Container) => {
        return () => requestor.get(key);
    }
);

class ResolverImpl implements Resolver, Registration {
    public constructor(
        public key: Key,
        public strategy: ResolverStrategy,
        public state: any
    ) {}

    public get $isResolver(): true {
        return true;
    }

    private resolving: boolean = false;

    public register(container: Container, key?: Key): Resolver {
        return container.registerResolver(key || this.key, this);
    }

    public resolve(handler: Container, requestor: Container): any {
        switch (this.strategy) {
            case ResolverStrategy.instance:
                return this.state;
            case ResolverStrategy.singleton: {
                if (this.resolving) {
                    throw new Error(`Cyclic dependency found: ${this.state.name}`);
                }
                this.resolving = true;
                const factory = handler.getFactory(this.state as Constructable);
                if (factory === null) {
                    throw new Error(
                        `Resolver for ${String(this.key)} returned a null factory`
                    );
                }
                this.state = factory.construct(requestor);
                this.strategy = ResolverStrategy.instance;
                this.resolving = false;
                return this.state;
            }
            case ResolverStrategy.transient: {
                // Always create transients from the requesting container
                const factory = handler.getFactory(this.state as Constructable);
                if (factory === null) {
                    throw new Error(
                        `Resolver for ${String(this.key)} returned a null factory`
                    );
                }
                return factory.construct(requestor);
            }
            case ResolverStrategy.callback:
                return (this.state as ResolveCallback)(handler, requestor, this);
            case ResolverStrategy.array:
                return (this.state as Resolver[])[0].resolve(handler, requestor);
            case ResolverStrategy.alias:
                return handler.get(this.state);
            default:
                throw new Error(`Invalid resolver strategy specified: ${this.strategy}`);
        }
    }

    public getFactory(container: Container): Factory | null {
        let resolver: Resolver | null;
        switch (this.strategy) {
            case ResolverStrategy.singleton:
            case ResolverStrategy.transient:
                return container.getFactory(this.state as Constructable);
            case ResolverStrategy.alias:
                resolver = container.getResolver(this.state);
                if (resolver == null || resolver.getFactory === void 0) {
                    return null;
                }
                return resolver.getFactory(container);
            default:
                return null;
        }
    }
}

const containerResolver: Resolver = {
    $isResolver: true,
    resolve(handler: Container, requestor: Container): Container {
        return requestor;
    },
};

/* eslint-disable-next-line */
function isObject<T extends object = Object | Function>(value: unknown): value is T {
    return (typeof value === "object" && value !== null) || typeof value === "function";
}

function isClass<T extends { prototype?: any }>(obj: T): obj is Class<any, T> {
    return obj.prototype !== void 0;
}

function isRegistry(obj: Registry | Record<string, Registry>): obj is Registry {
    return typeof obj.register === "function";
}

function isSelfRegistry<T extends Constructable>(
    obj: RegisterSelf<T>
): obj is RegisterSelf<T> {
    return isRegistry(obj) && typeof obj.registerInRequestor === "boolean";
}

function isRegisterInRequester<T extends Constructable>(
    obj: RegisterSelf<T>
): obj is RegisterSelf<T> {
    return isSelfRegistry(obj) && obj.registerInRequestor;
}

function validateKey(key: any): void {
    if (key === null || key === void 0) {
        throw new Error(
            "key/value cannot be null or undefined. Are you trying to inject/register something that doesn't exist with DI?"
        );
    }
}

function buildAllResponse(
    resolver: Resolver,
    handler: Container,
    requestor: Container
): any[] {
    if (
        resolver instanceof ResolverImpl &&
        resolver.strategy === ResolverStrategy.array
    ) {
        const state = resolver.state as Resolver[];
        let i = state.length;
        const results = new Array(i);

        while (i--) {
            results[i] = state[i].resolve(handler, requestor);
        }

        return results;
    }

    return [resolver.resolve(handler, requestor)];
}

const InstrinsicTypeNames = new Set<string>([
    "Array",
    "ArrayBuffer",
    "Boolean",
    "DataView",
    "Date",
    "Error",
    "EvalError",
    "Float32Array",
    "Float64Array",
    "Function",
    "Int8Array",
    "Int16Array",
    "Int32Array",
    "Map",
    "Number",
    "Object",
    "Promise",
    "RangeError",
    "ReferenceError",
    "RegExp",
    "Set",
    "SharedArrayBuffer",
    "String",
    "SyntaxError",
    "TypeError",
    "Uint8Array",
    "Uint8ClampedArray",
    "Uint16Array",
    "Uint32Array",
    "URIError",
    "WeakMap",
    "WeakSet",
]);

interface Invoker<T extends Constructable = any> {
    invoke(container: Container, fn: T, dependencies: Key[]): Resolved<T>;
    invokeWithDynamicDependencies(
        container: Container,
        fn: T,
        staticDependencies: Key[],
        dynamicDependencies: Key[]
    ): Resolved<T>;
}

/** @internal */
export class FactoryImpl<T extends Constructable = any> implements Factory<T> {
    private transformers: ((instance: any) => any)[] | null = null;
    public constructor(
        public Type: T,
        private readonly invoker: Invoker,
        private readonly dependencies: Key[]
    ) {}

    public construct(container: Container, dynamicDependencies?: Key[]): Resolved<T> {
        const transformers = this.transformers;
        let instance =
            dynamicDependencies !== void 0
                ? this.invoker.invokeWithDynamicDependencies(
                      container,
                      this.Type,
                      this.dependencies,
                      dynamicDependencies
                  )
                : this.invoker.invoke(container, this.Type, this.dependencies);

        if (transformers == null) {
            return instance;
        }

        for (let i = 0, ii = transformers.length; i < ii; ++i) {
            instance = transformers[i](instance);
        }

        return instance;
    }

    public registerTransformer(transformer: (instance: any) => any): boolean {
        if (this.transformers == null) {
            this.transformers = [];
        }

        this.transformers.push(transformer);
        return true;
    }
}

const createFactory = (function () {
    function invokeWithDynamicDependencies<T>(
        container: Container,
        Type: Constructable<T>,
        staticDependencies: Key[],
        dynamicDependencies: Key[]
    ): T {
        let i = staticDependencies.length;
        let args: Key[] = new Array(i);
        let lookup: Key;

        while (i-- > 0) {
            lookup = staticDependencies[i];

            if (lookup == null) {
                throw new Error(
                    `Constructor Parameter with index ${i} cannot be null or undefined. Are you trying to inject/register something that doesn't exist with DI?`
                );
            } else {
                args[i] = container.get(lookup);
            }
        }

        if (dynamicDependencies !== void 0) {
            args = args.concat(dynamicDependencies);
        }

        return Reflect.construct(Type, args);
    }

    const classInvokers: Invoker[] = [
        {
            invoke<T>(container: Container, Type: Constructable<T>): T {
                return new Type();
            },
            invokeWithDynamicDependencies,
        },
        {
            invoke<T>(container: Container, Type: Constructable<T>, deps: Key[]): T {
                return new Type(container.get(deps[0]));
            },
            invokeWithDynamicDependencies,
        },
        {
            invoke<T>(container: Container, Type: Constructable<T>, deps: Key[]): T {
                return new Type(container.get(deps[0]), container.get(deps[1]));
            },
            invokeWithDynamicDependencies,
        },
        {
            invoke<T>(container: Container, Type: Constructable<T>, deps: Key[]): T {
                return new Type(
                    container.get(deps[0]),
                    container.get(deps[1]),
                    container.get(deps[2])
                );
            },
            invokeWithDynamicDependencies,
        },
        {
            invoke<T>(container: Container, Type: Constructable<T>, deps: Key[]): T {
                return new Type(
                    container.get(deps[0]),
                    container.get(deps[1]),
                    container.get(deps[2]),
                    container.get(deps[3])
                );
            },
            invokeWithDynamicDependencies,
        },
        {
            invoke<T>(container: Container, Type: Constructable<T>, deps: Key[]): T {
                return new Type(
                    container.get(deps[0]),
                    container.get(deps[1]),
                    container.get(deps[2]),
                    container.get(deps[3]),
                    container.get(deps[4])
                );
            },
            invokeWithDynamicDependencies,
        },
    ];

    const fallbackInvoker: Invoker = {
        invoke: invokeWithDynamicDependencies as (
            container: Container,
            fn: Constructable,
            dependencies: Key[]
        ) => Constructable,
        invokeWithDynamicDependencies,
    };

    return function <T extends Constructable>(Type: T): Factory<T> {
        const dependencies = DI.getDependencies(Type);
        const invoker =
            classInvokers.length > dependencies.length
                ? classInvokers[dependencies.length]
                : fallbackInvoker;

        return new FactoryImpl<T>(Type, invoker, dependencies);
    };
})();

const factories = new Map<Constructable, Factory>();

class ContainerImpl implements Container {
    private registerDepth: number = 0;
    private resolvers: Map<Key, Resolver>;
    private _parent: ContainerImpl | null | undefined = void 0;

    constructor(protected owner: any, protected config: ContainerConfiguration) {
        if (owner !== null) {
            owner.$container = this;
        }

        this.resolvers = new Map();
        this.resolvers.set(Container, containerResolver);

        if (owner instanceof HTMLElement) {
            owner.addEventListener(
                DILocateParentEventType,
                (e: CustomEvent<DOMParentLocatorEventDetail>) => {
                    if (e.target !== this.owner) {
                        e.detail.container = this;
                        e.stopImmediatePropagation();
                    }
                }
            );
        }
    }

    protected get parent() {
        if (this._parent === void 0) {
            this._parent = this.config.parentLocator(this.owner) as ContainerImpl;
        }

        return this._parent;
    }

    public register(...params: any[]): Container {
        if (++this.registerDepth === 100) {
            throw new Error("Unable to autoregister dependency");
            // Most likely cause is trying to register a plain object that does not have a
            // register method and is not a class constructor
        }

        let current: Registry | Record<string, Registry>;
        let keys: string[];
        let value: Registry;
        let j: number;
        let jj: number;

        for (let i = 0, ii = params.length; i < ii; ++i) {
            current = params[i];

            if (!isObject(current)) {
                continue;
            }

            if (isRegistry(current)) {
                current.register(this);
            } else if (isClass(current)) {
                Registration.singleton(
                    current,
                    (current as any) as Constructable
                ).register(this);
            } else {
                keys = Object.keys(current);
                j = 0;
                jj = keys.length;
                for (; j < jj; ++j) {
                    value = current[keys[j]];
                    if (!isObject(value)) {
                        continue;
                    }
                    // note: we could remove this if-branch and call this.register directly
                    // - the extra check is just a perf tweak to create fewer unnecessary arrays by the spread operator
                    if (isRegistry(value)) {
                        value.register(this);
                    } else {
                        this.register(value);
                    }
                }
            }
        }

        --this.registerDepth;

        return this;
    }

    public registerResolver<K extends Key, T = K>(
        key: K,
        resolver: Resolver<T>
    ): Resolver<T> {
        validateKey(key);

        const resolvers = this.resolvers;
        const result = resolvers.get(key);

        if (result == null) {
            resolvers.set(key, resolver);
        } else if (
            result instanceof ResolverImpl &&
            result.strategy === ResolverStrategy.array
        ) {
            (result.state as Resolver[]).push(resolver);
        } else {
            resolvers.set(
                key,
                new ResolverImpl(key, ResolverStrategy.array, [result, resolver])
            );
        }

        return resolver;
    }

    public registerTransformer<K extends Key, T = K>(
        key: K,
        transformer: Transformer<T>
    ): boolean {
        const resolver = this.getResolver(key);

        if (resolver == null) {
            return false;
        }

        if (resolver.getFactory) {
            const factory = resolver.getFactory(this);

            if (factory == null) {
                return false;
            }

            // This type cast is a bit of a hacky one, necessary due to the duplicity of IResolverLike.
            // Problem is that that interface's type arg can be of type Key, but the getFactory method only works on
            // type Constructable. So the return type of that optional method has this additional constraint, which
            // seems to confuse the type checker.
            return factory.registerTransformer(
                (transformer as unknown) as Transformer<Constructable>
            );
        }

        return false;
    }

    public getResolver<K extends Key, T = K>(
        key: K | Key,
        autoRegister: boolean = true
    ): Resolver<T> | null {
        validateKey(key);

        if (((key as unknown) as Resolver).resolve !== void 0) {
            return (key as unknown) as Resolver;
        }

        /* eslint-disable-next-line */
        let current: ContainerImpl = this;
        let resolver: Resolver | undefined;

        while (current != null) {
            resolver = current.resolvers.get(key);

            if (resolver == null) {
                if (current.parent == null) {
                    const handler = isRegisterInRequester(
                        (key as unknown) as RegisterSelf<Constructable>
                    )
                        ? this
                        : current;
                    return autoRegister ? this.jitRegister(key, handler) : null;
                }

                current = current.parent;
            } else {
                return resolver;
            }
        }

        return null;
    }

    public has<K extends Key>(key: K, searchAncestors: boolean = false): boolean {
        return this.resolvers.has(key)
            ? true
            : searchAncestors && this.parent != null
            ? this.parent.has(key, true)
            : false;
    }

    public get<K extends Key>(key: K): Resolved<K> {
        validateKey(key);

        if ((key as Resolver).$isResolver) {
            return (key as Resolver).resolve(this, this);
        }

        /* eslint-disable-next-line */
        let current: ContainerImpl = this;
        let resolver: Resolver | undefined;

        while (current != null) {
            resolver = current.resolvers.get(key);

            if (resolver == null) {
                if (current.parent == null) {
                    const handler = isRegisterInRequester(
                        (key as unknown) as RegisterSelf<Constructable>
                    )
                        ? this
                        : current;
                    resolver = this.jitRegister(key, handler);
                    return resolver.resolve(current, this);
                }

                current = current.parent;
            } else {
                return resolver.resolve(current, this);
            }
        }

        throw new Error(`Unable to resolve key: ${key}`);
    }

    public getAll<K extends Key>(
        key: K,
        searchAncestors: boolean = false
    ): readonly Resolved<K>[] {
        validateKey(key);

        /* eslint-disable-next-line */
        const requestor = this;
        let current: ContainerImpl | null = requestor;
        let resolver: Resolver | undefined;

        if (searchAncestors) {
            let resolutions: any[] = emptyArray as any;

            while (current != null) {
                resolver = current.resolvers.get(key);

                if (resolver != null) {
                    resolutions = resolutions.concat(
                        buildAllResponse(resolver, current, requestor)
                    );
                }

                current = current.parent;
            }

            return resolutions;
        } else {
            while (current != null) {
                resolver = current.resolvers.get(key);

                if (resolver == null) {
                    current = current.parent;

                    if (current == null) {
                        return emptyArray;
                    }
                } else {
                    return buildAllResponse(resolver, current, requestor);
                }
            }
        }

        return emptyArray;
    }

    public getFactory<K extends Constructable>(Type: K): Factory<K> | null {
        let factory = factories.get(Type);

        if (factory === void 0) {
            factories.set(Type, (factory = createFactory(Type)));
        }

        return factory;
    }

    public registerFactory<K extends Constructable>(key: K, factory: Factory<K>): void {
        factories.set(key, factory);
    }

    public createChild(
        config?: Partial<Omit<ContainerConfiguration, "parentLocator">>
    ): Container {
        return new ContainerImpl(
            null,
            Object.assign({}, this.config, config, { parentLocator: () => this })
        );
    }

    private jitRegister(keyAsValue: any, handler: ContainerImpl): Resolver {
        if (typeof keyAsValue !== "function") {
            throw new Error(
                `Attempted to jitRegister something that is not a constructor: '${keyAsValue}'. Did you forget to register this resource?`
            );
        }

        if (InstrinsicTypeNames.has(keyAsValue.name)) {
            throw new Error(
                `Attempted to jitRegister an intrinsic type: ${keyAsValue.name}. Did you forget to add @inject(Key)`
            );
        }

        if (isRegistry(keyAsValue)) {
            const registrationResolver = keyAsValue.register(handler, keyAsValue);
            if (
                !(registrationResolver instanceof Object) ||
                (registrationResolver as Resolver).resolve == null
            ) {
                const newResolver = handler.resolvers.get(keyAsValue);

                if (newResolver != void 0) {
                    return newResolver;
                }

                throw new Error(
                    "A valid resolver was not returned from the static register method"
                );
            }

            return registrationResolver as Resolver;
        } else if (keyAsValue.$isInterface) {
            throw new Error(
                `Attempted to jitRegister an interface: ${keyAsValue.friendlyName}`
            );
        } else {
            const resolver = this.config.defaultResolver(keyAsValue, handler);
            handler.resolvers.set(keyAsValue, resolver);
            return resolver;
        }
    }
}

/**
 * you can use the resulting {@link (Registration:interface)} of any of the factory methods
 * to register with the container, e.g.
 * ```
 * class Foo {}
 * const container = DI.createContainer();
 * container.register(Registration.instance(Foo, new Foo()));
 * container.get(Foo);
 * ```
 *
 * @alpha
 */
export const Registration = Object.freeze({
    /**
     * allows you to pass an instance.
     * Every time you request this {@link Key} you will get this instance back.
     * ```
     * Registration.instance(Foo, new Foo()));
     * ```
     *
     * @param key - The dependency key
     * @param value - The dependency value
     */
    instance<T>(key: Key, value: T): Registration<T> {
        return new ResolverImpl(key, ResolverStrategy.instance, value);
    },
    /**
     * Creates an instance from the class.
     * Every time you request this {@link Key} you will get the same one back.
     * ```
     * Registration.singleton(Foo, Foo);
     * ```
     *
     * @param key - The dependency key
     * @param value - The dependency value
     */
    singleton<T extends Constructable>(
        key: Key,
        value: T
    ): Registration<InstanceType<T>> {
        return new ResolverImpl(key, ResolverStrategy.singleton, value);
    },
    /**
     * Creates an instance from a class.
     * Every time you request this {@link Key} you will get a new instance.
     * ```
     * Registration.instance(Foo, Foo);
     * ```
     *
     * @param key - The dependency key
     * @param value - The dependency value
     */
    transient<T extends Constructable>(
        key: Key,
        value: T
    ): Registration<InstanceType<T>> {
        return new ResolverImpl(key, ResolverStrategy.transient, value);
    },
    /**
     * Creates an instance from the method passed.
     * Every time you request this {@link Key} you will get a new instance.
     * ```
     * Registration.callback(Foo, () => new Foo());
     * Registration.callback(Bar, (c: IContainer) => new Bar(c.get(Foo)));
     * ```
     *
     * @param key - The dependency key
     * @param callback - The callback to invoke
     */
    callback<T>(key: Key, callback: ResolveCallback<T>): Registration<Resolved<T>> {
        return new ResolverImpl(key, ResolverStrategy.callback, callback);
    },
    /**
     * Creates an instance from the method passed.
     * On the first request for the {@link Key} your callback is called and returns an instance.
     * subsequent requests for the {@link Key}, the initial instance returned will be returned.
     * If you pass the same {@link (Registration:interface)} to another container the same cached value will be used.
     * Should all references to the resolver returned be removed, the cache will expire.
     * ```
     * Registration.cachedCallback(Foo, () => new Foo());
     * Registration.cachedCallback(Bar, (c: IContainer) => new Bar(c.get(Foo)));
     * ```
     *
     * @param key - The dependency key
     * @param callback - The callback to invoke
     */
    cachedCallback<T>(key: Key, callback: ResolveCallback<T>): Registration<Resolved<T>> {
        return new ResolverImpl(
            key,
            ResolverStrategy.callback,
            cacheCallbackResult(callback)
        );
    },
    /**
     * creates an alternate {@link Key} to retrieve an instance by.
     * Returns the same scope as the original {@link Key}.
     * ```
     * Register.singleton(Foo, Foo)
     * Register.aliasTo(Foo, MyFoos);
     *
     * container.getAll(MyFoos) // contains an instance of Foo
     * ```
     *
     * @param originalKey - The original dependency key
     * @param aliasKey - The key to alias the original to
     */
    aliasTo<T>(originalKey: T, aliasKey: Key): Registration<Resolved<T>> {
        return new ResolverImpl(aliasKey, ResolverStrategy.alias, originalKey);
    },
});