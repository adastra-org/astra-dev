import { EtherStage, type OrbState } from '@wefaber/orb'

/**
 * El orbe de Ether (@wefaber/orb). Decorativo: el texto de al lado ya dice qué es. Va sobre su placa
 * oscura (`plate`, +35 % del tamaño) y no sigue el puntero, así puede haber varios en pantalla.
 */
export function EtherOrb({
  size = 20,
  state = 'idle',
  className = '',
}: {
  size?: number
  state?: OrbState
  className?: string
}) {
  return (
    <EtherStage
      variant="orb"
      state={state}
      size={size}
      plate
      label={false}
      followPointer={false}
      className={className}
    />
  )
}
