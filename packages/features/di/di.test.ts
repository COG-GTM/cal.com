import { describe, expect, it, vi } from "vitest";
import type { Container, Module, ModuleLoader } from "./di";
import { bindModuleToClassOnToken, createContainer, createModule } from "./di";

/**
 * The public overloads intentionally forbid passing both/neither of `dep` and `depsMap`,
 * so the runtime guards can only be reached through this looser signature.
 */
const bindWithUncheckedArgs = bindModuleToClassOnToken as unknown as (args: {
  module: Module;
  moduleToken: symbol;
  token: symbol;
  classs: new (deps: never) => unknown;
  dep?: ModuleLoader;
  depsMap?: Record<string, ModuleLoader>;
}) => (container: Container) => void;

class SingleDepService {
  constructor(public readonly dep: { value: string }) {}
}

class MultiDepService {
  constructor(public readonly deps: { first: { value: string }; second: { value: string } }) {}
}

function makeValueModuleLoader(token: symbol, value: unknown): ModuleLoader {
  const module = createModule();
  const moduleToken = Symbol("valueModule");
  module.bind(token).toValue(value);
  return {
    token,
    loadModule: (container: Container) => container.load(moduleToken, module),
  };
}

describe("bindModuleToClassOnToken", () => {
  it("binds a class with a single constructor dependency", () => {
    const depToken = Symbol("dep");
    const serviceToken = Symbol("service");
    const dep = { value: "single" };

    const loadModule = bindModuleToClassOnToken({
      module: createModule(),
      moduleToken: Symbol("serviceModule"),
      token: serviceToken,
      classs: SingleDepService,
      dep: makeValueModuleLoader(depToken, dep),
    });

    const container = createContainer();
    loadModule(container);

    const service = container.get<SingleDepService>(serviceToken);
    expect(service).toBeInstanceOf(SingleDepService);
    expect(service.dep).toBe(dep);
  });

  it("binds a class with a map of constructor dependencies", () => {
    const firstToken = Symbol("first");
    const secondToken = Symbol("second");
    const serviceToken = Symbol("service");
    const first = { value: "first" };
    const second = { value: "second" };

    const loadModule = bindModuleToClassOnToken({
      module: createModule(),
      moduleToken: Symbol("serviceModule"),
      token: serviceToken,
      classs: MultiDepService,
      depsMap: {
        first: makeValueModuleLoader(firstToken, first),
        second: makeValueModuleLoader(secondToken, second),
      },
    });

    const container = createContainer();
    loadModule(container);

    const service = container.get<MultiDepService>(serviceToken);
    expect(service).toBeInstanceOf(MultiDepService);
    expect(service.deps).toEqual({ first, second });
  });

  it("loads every dependency module into the container", () => {
    const depToken = Symbol("dep");
    const depLoader = makeValueModuleLoader(depToken, { value: "dep" });
    const loadModuleSpy = vi.spyOn(depLoader, "loadModule");

    const loadModule = bindModuleToClassOnToken({
      module: createModule(),
      moduleToken: Symbol("serviceModule"),
      token: Symbol("service"),
      classs: SingleDepService,
      dep: depLoader,
    });

    loadModule(createContainer());

    expect(loadModuleSpy).toHaveBeenCalledTimes(1);
  });

  it("throws when both dep and depsMap are provided", () => {
    expect(() =>
      bindWithUncheckedArgs({
        module: createModule(),
        moduleToken: Symbol("serviceModule"),
        token: Symbol("service"),
        classs: SingleDepService,
        dep: makeValueModuleLoader(Symbol("dep"), {}),
        depsMap: { dep: makeValueModuleLoader(Symbol("other"), {}) },
      })
    ).toThrow("Cannot provide both 'dep' and 'depsMap'");
  });

  it("throws when neither dep nor depsMap is provided", () => {
    expect(() =>
      bindWithUncheckedArgs({
        module: createModule(),
        moduleToken: Symbol("serviceModule"),
        token: Symbol("service"),
        classs: SingleDepService,
      })
    ).toThrow("Must provide either 'dep' for single dependency or 'depsMap' for multiple dependencies");
  });
});
