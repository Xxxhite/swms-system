import { describe, expect, test } from 'bun:test'
import { effectScope } from 'vue'
import { MOBILE_QUERY, NARROW_QUERY, useViewport } from '../src/composables/useViewport'

describe('视口监听生命周期', () => {
    test('手机与窄屏独立更新，释放作用域后不再更新或保留监听', () => {
        const entries = new Map<
            string,
            { matches: boolean; listeners: Set<(event: MediaQueryListEvent) => void> }
        >()
        const matchMedia = (query: string) => {
            const entry = {
                matches: query === NARROW_QUERY,
                listeners: new Set<(event: MediaQueryListEvent) => void>(),
            }
            entries.set(query, entry)
            return {
                matches: entry.matches,
                addEventListener: (_type: string, fn: (event: MediaQueryListEvent) => void) =>
                    entry.listeners.add(fn),
                removeEventListener: (_type: string, fn: (event: MediaQueryListEvent) => void) =>
                    entry.listeners.delete(fn),
            } as unknown as MediaQueryList
        }
        const scope = effectScope(),
            viewport = scope.run(() => useViewport(matchMedia))!
        expect(viewport.isMobile.value).toBe(false)
        expect(viewport.isNarrow.value).toBe(true)
        for (const listener of entries.get(MOBILE_QUERY)!.listeners)
            listener({ matches: true } as MediaQueryListEvent)
        expect(viewport.isMobile.value).toBe(true)
        expect(viewport.isNarrow.value).toBe(true)
        for (const listener of entries.get(NARROW_QUERY)!.listeners)
            listener({ matches: false } as MediaQueryListEvent)
        expect(viewport.isNarrow.value).toBe(false)
        scope.stop()
        expect([...entries.values()].every((entry) => entry.listeners.size === 0)).toBe(true)
    })
    test('无浏览器环境也可创建并释放作用域', () => {
        const scope = effectScope(),
            viewport = scope.run(() => useViewport())!
        expect(viewport.isMobile.value).toBe(false)
        expect(viewport.isNarrow.value).toBe(false)
        scope.stop()
    })
})
