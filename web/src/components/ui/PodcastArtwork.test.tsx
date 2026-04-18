import '@testing-library/jest-dom'
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { PodcastArtwork } from './PodcastArtwork'

describe('PodcastArtwork', () => {
  it('renders an img when src is provided', () => {
    render(<PodcastArtwork src="https://example.com/art.jpg" title="My Podcast" className="w-10 h-10" />)
    expect(screen.getByRole('img')).toBeInTheDocument()
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/art.jpg')
  })

  it('renders letter tile immediately when src is null', () => {
    render(<PodcastArtwork src={null} title="My Podcast" className="w-10 h-10" />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('M')).toBeInTheDocument()
  })

  it('renders letter tile immediately when src is empty string', () => {
    render(<PodcastArtwork src="" title="Syntax" className="w-10 h-10" />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('S')).toBeInTheDocument()
  })

  it('renders letter tile immediately when src is undefined', () => {
    render(<PodcastArtwork title="Hello World" className="w-10 h-10" />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('H')).toBeInTheDocument()
  })

  it('swaps to letter tile when img fires onError', () => {
    render(<PodcastArtwork src="https://broken.com/art.jpg" title="Bad Podcast" className="w-10 h-10" />)
    const img = screen.getByRole('img')
    fireEvent.error(img)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
  })

  it('uses ? when title is null', () => {
    render(<PodcastArtwork src={null} title={null} className="w-10 h-10" />)
    expect(screen.getByText('?')).toBeInTheDocument()
  })

  it('uses ? when title is empty string', () => {
    render(<PodcastArtwork src={null} title="" className="w-10 h-10" />)
    expect(screen.getByText('?')).toBeInTheDocument()
  })

  it('same title always produces the same background color', () => {
    const { container: c1 } = render(<PodcastArtwork src={null} title="Consistent Show" className="w-10 h-10" />)
    const { container: c2 } = render(<PodcastArtwork src={null} title="Consistent Show" className="w-10 h-10" />)
    const color1 = (c1.firstChild as HTMLElement).style.backgroundColor
    const color2 = (c2.firstChild as HTMLElement).style.backgroundColor
    expect(color1).toBe(color2)
    expect(color1).not.toBe('')
  })

  it('different titles produce different background colors', () => {
    const { container: c1 } = render(<PodcastArtwork src={null} title="Alpha Show" className="w-10 h-10" />)
    const { container: c2 } = render(<PodcastArtwork src={null} title="Zeta Show" className="w-10 h-10" />)
    const color1 = (c1.firstChild as HTMLElement).style.backgroundColor
    const color2 = (c2.firstChild as HTMLElement).style.backgroundColor
    expect(color1).not.toBe(color2)
  })

  it('applies className to the outer div when src is provided', () => {
    const { container } = render(<PodcastArtwork src="https://example.com/art.jpg" title="Test" className="w-10 h-10 rounded-lg" />)
    expect(container.firstChild).toHaveClass('w-10', 'h-10', 'rounded-lg')
    expect(screen.getByRole('img')).toBeInTheDocument()
  })

  it('applies className to the letter tile div', () => {
    const { container } = render(<PodcastArtwork src={null} title="Test" className="w-10 h-10 rounded-lg" />)
    expect(container.firstChild).toHaveClass('w-10', 'h-10', 'rounded-lg')
  })

  it('shows letter tile before image loads', () => {
    render(<PodcastArtwork src="https://example.com/art.jpg" title="My Podcast" className="w-10 h-10" />)
    expect(screen.getByText('M')).toBeInTheDocument()
    const img = screen.getByRole('img')
    expect(img).toHaveClass('opacity-0')
  })

  it('hides letter tile after image loads', () => {
    render(<PodcastArtwork src="https://example.com/art.jpg" title="My Podcast" className="w-10 h-10" />)
    const img = screen.getByRole('img')
    fireEvent.load(img)
    expect(screen.queryByText('M')).not.toBeInTheDocument()
    expect(img).toHaveClass('opacity-100')
    expect(img).not.toHaveClass('opacity-0')
  })
})
