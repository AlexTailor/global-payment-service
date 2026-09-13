import useMedia from "react-use/lib/useMedia"

export function useMediaQuery(query: string): boolean {
  return useMedia(query, false)
}
