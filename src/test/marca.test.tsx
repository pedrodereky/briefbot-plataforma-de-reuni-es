import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MarcaBriefBot } from '@/components/MarcaBriefBot';

describe('MarcaBriefBot', () => {
  it('monta sem estourar e tem rótulo acessível', () => {
    const { getByLabelText } = render(<MarcaBriefBot />);
    expect(getByLabelText('BriefBot')).toBeInTheDocument();
  });

  it('liga a máscara ao id que ela realmente tem', () => {
    // `useId` devolve algo como ":r0:". Os dois-pontos são legais num id de
    // HTML mas quebram seletor CSS — por isso a referência é feita por
    // atributo (mask="url(#id)"), que o navegador resolve pelo fragmento, e
    // nunca por querySelector.
    const { container } = render(<MarcaBriefBot />);
    const mascara = container.querySelector('mask');
    const caminho = container.querySelector('path[mask]');
    expect(mascara).not.toBeNull();
    expect(caminho!.getAttribute('mask')).toBe(`url(#${mascara!.id})`);
  });

  it('duas instâncias na mesma página não compartilham o id da máscara', () => {
    const { container } = render(
      <>
        <MarcaBriefBot />
        <MarcaBriefBot />
      </>,
    );
    const ids = [...container.querySelectorAll('mask')].map((m) => m.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it('herda a cor de quem a contém, para servir nos dois temas', () => {
    const { getByLabelText } = render(<MarcaBriefBot />);
    expect(getByLabelText('BriefBot').getAttribute('fill')).toBe('currentColor');
  });
});
