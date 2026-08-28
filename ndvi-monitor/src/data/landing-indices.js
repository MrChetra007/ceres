import ndviBefore from '../assets/landing-assets/NDVI/filed.jpeg'
import ndviAfter from '../assets/landing-assets/NDVI/rendered.jpeg'
import ndwiBefore from '../assets/landing-assets/NDWI/filed.jpeg'
import ndwiAfter from '../assets/landing-assets/NDWI/rendered.jpeg'
import lswiBefore from '../assets/landing-assets/LSWI/filed.jpeg'
import lswiAfter from '../assets/landing-assets/LSWI/rendered.jpeg'
import saviBefore from '../assets/landing-assets/SAVI/filed.png'
import saviAfter from '../assets/landing-assets/SAVI/rendered.png'
import eviBefore from '../assets/landing-assets/EVI/filed.jpeg'
import eviAfter from '../assets/landing-assets/EVI/rendered.jpeg'
import gndviBefore from '../assets/landing-assets/GNDVI/filed.jpeg'
import gndviAfter from '../assets/landing-assets/GNDVI/rendered.jpeg'

export const landingIndices = [
  {
    key: 'ndvi',
    name: 'NDVI',
    fullName: 'Normalized Difference Vegetation Index',
    formula: 'NDVI = (NIR \u2212 Red) / (NIR + Red)',
    description:
      'The standard index for measuring plant health and density from satellite imagery \u2014 higher values mean denser, healthier vegetation.',
    scaleLow: 'water, clouds, bare soil',
    scaleHigh: 'healthy, dense vegetation',
    gradient: ['#c1443c', '#e3a72e', '#6ba85f'],
    beforeImage: ndviBefore,
    afterImage: ndviAfter,
  },
  {
    key: 'ndwi',
    name: 'NDWI',
    fullName: 'Normalized Difference Water Index',
    formula: 'NDWI = (Green \u2212 NIR) / (Green + NIR)',
    description:
      'Reads standing water instead of greenness \u2014 a flooded paddy lights up where a dry field stays dark, catching the wet phase NDVI misses.',
    scaleLow: 'dry land, little or no water',
    scaleHigh: 'standing water, flooded paddies',
    gradient: ['#8a6a4d', '#d9c79a', '#9cc9e3', '#4a90d9', '#1d3f6b'],
    beforeImage: ndwiBefore,
    afterImage: ndwiAfter,
  },
  {
    key: 'lswi',
    name: 'LSWI',
    fullName: 'Land Surface Water Index',
    formula: 'LSWI = (NIR \u2212 SWIR) / (NIR + SWIR)',
    description:
      'Uses the shortwave band to sense water held in soil and plant canopies \u2014 the saturated canopy and wet paddy floor read clearly through it.',
    scaleLow: 'dry soil, dry vegetation',
    scaleHigh: 'moist soil, saturated canopy',
    gradient: ['#d9c79a', '#9cc9e3', '#1d5a86'],
    beforeImage: lswiBefore,
    afterImage: lswiAfter,
  },
  {
    key: 'savi',
    name: 'SAVI',
    fullName: 'Soil-Adjusted Vegetation Index',
    formula: 'SAVI = (NIR \u2212 Red) \u00d7 (1 + L) / (NIR + Red + L),  L = 0.5',
    description:
      'Corrects for bare-soil brightness (L = 0.5), so sparse, early-season and low-cover fields read more accurately than they do on raw NDVI.',
    scaleLow: 'bare, bright soil; sparse cover',
    scaleHigh: 'dense, healthy vegetation',
    gradient: ['#8a6a4d', '#e3a72e', '#6ba85f'],
    beforeImage: saviBefore,
    afterImage: saviAfter,
  },
  {
    key: 'evi',
    name: 'EVI',
    fullName: 'Enhanced Vegetation Index',
    formula: 'EVI = 2.5 \u00d7 (NIR \u2212 Red) / (NIR + 6\u00b7Red \u2212 7.5\u00b7Blue + 1)',
    description:
      'Resists saturation at high biomass and corrects atmospheric haze with the blue band \u2014 it keeps telling fields apart even at peak greenness.',
    scaleLow: 'low biomass, bare ground',
    scaleHigh: 'dense vegetation, high biomass',
    gradient: ['#c1443c', '#c9742e', '#6ba85f'],
    beforeImage: eviBefore,
    afterImage: eviAfter,
  },
  {
    key: 'gndvi',
    name: 'GNDVI',
    fullName: 'Green Normalized Difference Vegetation Index',
    formula: 'GNDVI = (NIR \u2212 Green) / (NIR + Green)',
    description:
      'Swaps red for the green band, which responds more strongly to chlorophyll and canopy water \u2014 a sharper read on vigour mid-season.',
    scaleLow: 'sparse cover, low chlorophyll',
    scaleHigh: 'dense canopy, high chlorophyll',
    gradient: ['#c1443c', '#7b5ea7', '#6ba85f'],
    beforeImage: gndviBefore,
    afterImage: gndviAfter,
  },
]