import { onScopeDispose, readonly, ref } from 'vue'

export const MOBILE_QUERY = '(max-width: 767px)'
export const NARROW_QUERY = '(max-width: 1023px)'

/** 每个使用方随作用域释放监听，窗口变化只更新展示，不重建业务状态。 */
export function useViewport(
    matchMedia = typeof window === 'undefined' ? undefined : window.matchMedia.bind(window),
) {
    function observe(query: string) {
        const media = matchMedia?.(query)
        const matches = ref(media?.matches ?? false)
        const update = (event: MediaQueryListEvent) => {
            matches.value = event.matches
        }
        media?.addEventListener('change', update)
        onScopeDispose(() => media?.removeEventListener('change', update))
        return readonly(matches)
    }
    return { isMobile: observe(MOBILE_QUERY), isNarrow: observe(NARROW_QUERY) }
}
