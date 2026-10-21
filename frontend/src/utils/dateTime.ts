import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { APP_DATE_TIME_FORMAT, APP_TIME_ZONE } from '@/constants/time'

dayjs.extend(utc)
dayjs.extend(timezone)

/** 将接口时间转换为统一业务时区；空值或无效时间显示占位符。 */
export function formatDateTime(value: string | Date | null | undefined): string {
    if (value == null || (typeof value === 'string' && !value.trim())) return '—'
    const date = dayjs.utc(value)
    return date.isValid() ? date.tz(APP_TIME_ZONE).format(APP_DATE_TIME_FORMAT) : '—'
}
