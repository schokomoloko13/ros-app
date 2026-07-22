export function thumb(url: string | null | undefined, width = 120): string | null {
  if (!url) return null
  const rendered = url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/')
  return `${rendered}?width=${width}&quality=75&resize=cover`
}
