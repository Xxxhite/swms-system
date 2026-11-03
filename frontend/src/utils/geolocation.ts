import type { GeoSample } from '@/api/execution-types'
export function captureLocation(
    provider: Pick<Geolocation, 'getCurrentPosition'> | undefined = typeof navigator !== 'undefined'
        ? navigator.geolocation
        : undefined,
): Promise<GeoSample> {
    if (!provider) return Promise.resolve({ status: 'UNSUPPORTED' })
    return new Promise((resolve) => {
        try {
            provider.getCurrentPosition(
                (position) =>
                    resolve({
                        status: 'OK',
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy,
                        sampledAt: new Date(position.timestamp).toISOString(),
                    }),
                (error) =>
                    resolve({
                        status:
                            error.code === 1
                                ? 'DENIED'
                                : error.code === 3
                                  ? 'TIMEOUT'
                                  : 'UNAVAILABLE',
                    }),
                { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
            )
        } catch {
            resolve({ status: 'UNAVAILABLE' })
        }
    })
}
