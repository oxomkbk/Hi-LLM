import type { getTranslationLanguage } from '@/lib/translation/languages'

type CountryCode = ReturnType<typeof getTranslationLanguage>['countryCode']

interface LanguageFlagProps {
  className?: string
  countryCode: CountryCode
}

const CHINA_STAR_PATH = 'M0 -1 .225 -.309 .951 -.309 .363 .118 .588 .809 0 .382 -.588 .809 -.363 .118 -.951 -.309 -.225 -.309Z'

export default function LanguageFlag({ className = '', countryCode }: LanguageFlagProps) {
  return (
    <span aria-hidden="true" className={`inline-flex aspect-[3/2] shrink-0 overflow-hidden rounded-[3px] shadow-sm ring-1 ring-black/10 ${className}`}>
      <svg focusable="false" viewBox="0 0 30 20" className="size-full">
        {renderFlag(countryCode)}
      </svg>
    </span>
  )
}

function renderFlag(countryCode: CountryCode) {
  switch (countryCode) {
    case 'CN':
      return (
        <>
          <path d="M0 0h30v20H0z" fill="#DE2910" />
          <path d={CHINA_STAR_PATH} fill="#FFDE00" transform="translate(5 5) scale(3)" />
          <path d={CHINA_STAR_PATH} fill="#FFDE00" transform="translate(10 2) rotate(-121)" />
          <path d={CHINA_STAR_PATH} fill="#FFDE00" transform="translate(12 4) rotate(-98.1)" />
          <path d={CHINA_STAR_PATH} fill="#FFDE00" transform="translate(12 7) rotate(-74.1)" />
          <path d={CHINA_STAR_PATH} fill="#FFDE00" transform="translate(10 9) rotate(-51.3)" />
        </>
      )
    case 'GB':
      return (
        <>
          <path d="M0 0h30v20H0z" fill="#012169" />
          <path d="m0 0 30 20M30 0 0 20" stroke="#fff" strokeWidth="4" />
          <path d="m0 0 30 20M30 0 0 20" stroke="#C8102E" strokeWidth="2" />
          <path d="M15 0v20M0 10h30" stroke="#fff" strokeWidth="7" />
          <path d="M15 0v20M0 10h30" stroke="#C8102E" strokeWidth="4" />
        </>
      )
    case 'JP':
      return (
        <>
          <path d="M0 0h30v20H0z" fill="#fff" />
          <circle cx="15" cy="10" fill="#BC002D" r="5.4" />
        </>
      )
    case 'KR':
      return (
        <>
          <path d="M0 0h30v20H0z" fill="#fff" />
          <path d="M19 10a4 4 0 0 1-8 0 2 2 0 0 1 4-2 2 2 0 0 0 4-2 4 4 0 0 1 0 4" fill="#CD2E3A" />
          <path d="M11 10a4 4 0 0 0 8 0 2 2 0 0 0-4 2 2 2 0 0 1-4 2 4 4 0 0 1 0-4" fill="#0047A0" />
          <path d="m5 5 4-2m-3 4 4-2m10 10 4-2m-3 4 4-2M6 15l4 2m-5-4 4 2m12-10 4 2m-5-4 4 2" stroke="#111" strokeWidth=".8" />
        </>
      )
    case 'FR':
      return (
        <>
          <path d="M0 0h10v20H0z" fill="#002654" />
          <path d="M10 0h10v20H10z" fill="#fff" />
          <path d="M20 0h10v20H20z" fill="#CE1126" />
        </>
      )
    case 'DE':
      return (
        <>
          <path d="M0 0h30v6.67H0z" fill="#000" />
          <path d="M0 6.67h30v6.66H0z" fill="#DD0000" />
          <path d="M0 13.33h30V20H0z" fill="#FFCE00" />
        </>
      )
    case 'ES':
      return (
        <>
          <path d="M0 0h30v20H0z" fill="#AA151B" />
          <path d="M0 5h30v10H0z" fill="#F1BF00" />
          <circle cx="10" cy="10" fill="#AA151B" r="1.4" />
        </>
      )
    case 'PT':
      return (
        <>
          <path d="M0 0h12v20H0z" fill="#046A38" />
          <path d="M12 0h18v20H12z" fill="#DA291C" />
          <circle cx="12" cy="10" fill="#FFCC00" r="3.1" />
          <circle cx="12" cy="10" fill="#fff" r="1.9" />
        </>
      )
    case 'RU':
      return (
        <>
          <path d="M0 0h30v6.67H0z" fill="#fff" />
          <path d="M0 6.67h30v6.66H0z" fill="#0039A6" />
          <path d="M0 13.33h30V20H0z" fill="#D52B1E" />
        </>
      )
    case 'SA':
      return (
        <>
          <path d="M0 0h30v20H0z" fill="#006C35" />
          <path d="M8 7.2h14v1.3H8zM9 13h13v1H9z" fill="#fff" />
          <path d="M9.5 7.2h1v1.3h-1zm4 0h1v1.3h-1zm4 0h1v1.3h-1z" fill="#006C35" />
        </>
      )
    case 'VN':
      return (
        <>
          <path d="M0 0h30v20H0z" fill="#DA251D" />
          <path d="m15 4.2 1.35 4.15h4.37l-3.54 2.57 1.36 4.16L15 12.5l-3.54 2.58 1.36-4.16-3.54-2.57h4.37z" fill="#FF0" />
        </>
      )
  }
}
