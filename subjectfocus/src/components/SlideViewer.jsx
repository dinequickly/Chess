import { useEffect, useState } from 'react'

export default function SlideViewer({ slides = [], currentSlide = 0 }) {
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [displaySlide, setDisplaySlide] = useState(currentSlide)

  // Handle slide transitions with fade effect
  useEffect(() => {
    if (currentSlide !== displaySlide) {
      setIsTransitioning(true)

      // After fade out, update slide
      setTimeout(() => {
        setDisplaySlide(currentSlide)
        setIsTransitioning(false)
      }, 300) // Match CSS transition duration
    }
  }, [currentSlide])

  // Get current slide data
  const slide = slides[displaySlide] || null

  if (!slides || slides.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center p-8">
          <div className="text-6xl mb-4">📊</div>
          <h3 className="text-xl font-medium mb-2">No Slides Available</h3>
          <p className="text-gray-400">Slides will appear here during the session</p>
        </div>
      </div>
    )
  }

  if (!slide) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center p-8">
          <div className="text-6xl mb-4">⚠️</div>
          <h3 className="text-xl font-medium mb-2">Slide Not Found</h3>
          <p className="text-gray-400">Slide {currentSlide} is not available</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full bg-gray-900 flex flex-col">
      {/* Slide Counter */}
      <div className="bg-black bg-opacity-50 text-white px-4 py-2 text-sm flex justify-between items-center">
        <span>Slide {displaySlide + 1} of {slides.length}</span>
        {slide.title && <span className="font-medium">{slide.title}</span>}
      </div>

      {/* Main Slide Image */}
      <div className="flex-1 relative overflow-hidden">
        <img
          src={slide.url}
          alt={slide.title || `Slide ${displaySlide + 1}`}
          className={`w-full h-full object-contain transition-opacity duration-300 ${
            isTransitioning ? 'opacity-0' : 'opacity-100'
          }`}
          onError={(e) => {
            e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23333" width="400" height="300"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3EImage not available%3C/text%3E%3C/svg%3E'
          }}
        />
      </div>

      {/* Slide Notes */}
      {slide.notes && (
        <div className="bg-gray-800 text-white px-6 py-4 max-h-32 overflow-y-auto">
          <div className="text-xs font-semibold text-gray-400 uppercase mb-1">Notes</div>
          <p className="text-sm">{slide.notes}</p>
        </div>
      )}
    </div>
  )
}
