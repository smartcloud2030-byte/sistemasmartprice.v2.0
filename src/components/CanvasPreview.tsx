import React, { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Text, Transformer, Rect, Group } from 'react-konva';
import { motion, AnimatePresence } from 'motion/react';
import { useStore, isThreeProduct } from '../store';
import useImage from 'use-image';
import { getProxyUrl } from '../lib/utils';

const A4_WIDTH = 794; // 210mm at 96dpi
const A4_HEIGHT = 1123; // 297mm at 96dpi

const CanvasPreview = ({ id = "placa" }: { id?: string }) => {
  const { 
    textElements1, textElements2, textElements3,
    productImage1, productImage2, productImage3,
    background, setElement, setProductImage,
    zoom, setZoom,
    selectedId, setSelectedId,
    isPrinting,
    layouts, activeLayoutIndex,
    orientation,
    optionalText1, optionalText2, optionalText3, setOptionalText,
    isSingleProduct
  } = useStore();
  const activeLayout = layouts[activeLayoutIndex];
  const stageRef = useRef<any>(null);
  const productImg1Ref = useRef<any>(null);
  const productImg2Ref = useRef<any>(null);
  const productImg3Ref = useRef<any>(null);
  const trRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [bgImg, bgStatus] = useImage(getProxyUrl(background.url) || '', 'anonymous');
  const [displayedBg, setDisplayedBg] = useState<{url: string, img: HTMLImageElement} | null>(null);
  const [nextBg, setNextBg] = useState<{url: string, img: HTMLImageElement} | null>(null);
  
  const [prodImg1] = useImage(getProxyUrl(productImage1.url) || '', 'anonymous');
  const [prodImg2] = useImage(getProxyUrl(productImage2.url) || '', 'anonymous');
  const [prodImg3] = useImage(getProxyUrl(productImage3.url) || '', 'anonymous');
  const [autoScale, setAutoScale] = useState(1);
  if (!activeLayout) return null;

  // Faster background switching with double buffering
  useEffect(() => {
    // Reset displayedBg if activeLayoutIndex changes to prevent showing old background on new layout
    if (displayedBg && displayedBg.url !== background.url) {
      setDisplayedBg(null);
      setNextBg(null);
    }
  }, [activeLayoutIndex]);

  useEffect(() => {
    if (bgImg && background.url) {
      if (!displayedBg) {
        setDisplayedBg({ url: background.url, img: bgImg });
      } else if (displayedBg.url !== background.url) {
        setNextBg({ url: background.url, img: bgImg });
        // After a very short delay, swap them to ensure smoothness
        const timer = setTimeout(() => {
          setDisplayedBg({ url: background.url, img: bgImg });
          setNextBg(null);
        }, 30); // Even shorter delay for faster response
        return () => clearTimeout(timer);
      }
    } else if (!background.url) {
      setDisplayedBg(null);
      setNextBg(null);
    }
  }, [bgImg, background.url, activeLayoutIndex]);

  // If the URL changed but we are still showing the old one, we might want to show a loader
  const isBgLoading = background.url && (!displayedBg || (displayedBg.url !== background.url && !nextBg));

  // Force portrait for "Quart Suplem Maxi" as requested by user
  const isQuartSuplemMaxi = activeLayout.name === 'Quart Suplem Maxi';
  const isLandscape = !isQuartSuplemMaxi && orientation === 'landscape';
  const currentWidth = isLandscape ? A4_HEIGHT : A4_WIDTH;
  const currentHeight = isLandscape ? A4_WIDTH : A4_HEIGHT;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateScale = () => {
      if (!container) return;
      const margin = 20; // Reduced margin
      const containerWidth = container.clientWidth - margin;
      const containerHeight = container.clientHeight - margin;
      
      if (containerWidth <= 0 || containerHeight <= 0) return;

      const scaleW = containerWidth / currentWidth;
      const scaleH = containerHeight / currentHeight;
      
      const newScale = Math.min(scaleW, scaleH);
      setAutoScale(newScale);
    };

    const resizeObserver = new ResizeObserver(() => {
      updateScale();
    });

    resizeObserver.observe(container);
    // Initial update with a small delay to ensure container is ready
    const timer = setTimeout(updateScale, 100);

    return () => {
      resizeObserver.disconnect();
      clearTimeout(timer);
    };
  }, [currentWidth, currentHeight]);

  useEffect(() => {
    if (selectedId && trRef.current) {
      const stage = stageRef.current;
      const selectedNode = stage.findOne('#' + selectedId);
      if (selectedNode) {
        trRef.current.nodes([selectedNode]);
        trRef.current.getLayer().batchDraw();
      } else {
        trRef.current.nodes([]);
      }
    } else if (trRef.current) {
      trRef.current.nodes([]);
    }
  }, [selectedId]);

  const handleExport = () => {
    if (!stageRef.current) return '';
    // Use JPEG with 0.8 quality to significantly reduce memory usage
    // while maintaining high resolution (pixelRatio: 2)
    return stageRef.current.toDataURL({ 
      mimeType: 'image/jpeg', 
      quality: 0.8, 
      pixelRatio: 2 
    });
  };

  const handleExportPNG = () => {
    if (!stageRef.current) return '';
    // High quality PNG export
    return stageRef.current.toDataURL({ 
      mimeType: 'image/png',
      pixelRatio: 3 
    });
  };

  useEffect(() => {
    if (id === "placa") {
      (window as any).getCanvasData = handleExport;
      (window as any).getCanvasPNGData = handleExportPNG;
    }
  }, [id]);

  // Price formatting logic
  const renderPrice = (slot: 1 | 2 | 3, el: any, key: string) => {
    if (!el.visible) return null;
    if (slot === 3 && !productImage3.visible) return null;
    const priceStr = (el.text || '0,00').trim();
    
    // Check if it's a discount percentage
    if (priceStr.includes('%')) {
      return (
        <Group 
          key={key}
          id={`text-${slot}-price`}
          x={el.x} 
          y={el.y} 
          draggable 
          onClick={() => setSelectedId(`text-${slot}-price`)}
          onTap={() => setSelectedId(`text-${slot}-price`)}
          onDragEnd={(e) => setElement(slot, 'price', { x: e.target.x(), y: e.target.y() })}
          onTransformEnd={(e) => {
            const node = e.target;
            const scaleX = node.scaleX();
            node.scaleX(1);
            node.scaleY(1);
            setElement(slot, 'price', {
              x: node.x(),
              y: node.y(),
              fontSize: Math.max(10, el.fontSize * scaleX),
            });
          }}
        >
          <Text
            text={priceStr}
            fontSize={el.fontSize}
            fill={el.color}
            fontStyle={`${el.isBold ? 'bold' : ''} ${el.isItalic ? 'italic' : ''}`.trim() || 'normal'}
            fontFamily={el.fontFamily || 'Inter'}
            align="center"
            width={el.width || 200}
          />
        </Group>
      );
    }

    // Improved regex to handle thousands separators and different formats
    // Matches: "R$ 1.250,00", "1250.00", "1,250.00", "10", etc.
    const cleanPrice = priceStr.replace(/[^\d,.]/g, '');
    const parts = cleanPrice.split(/[,.]/);
    
    let mainValue = '0';
    let cents = '00';
    
    if (parts.length > 1) {
      cents = parts.pop() || '00';
      mainValue = parts.join('');
    } else {
      mainValue = parts[0] || '0';
    }
    
    // Fallback if parsing fails
    if (!mainValue) mainValue = '0';
    if (cents.length === 1) cents += '0';
    if (cents.length > 2) cents = cents.substring(0, 2);
    
    const isSelected = selectedId === `text-${slot}-price`;

    return (
      <Group 
        key={key}
        id={`text-${slot}-price`}
        x={el.x} 
        y={el.y} 
        draggable 
        onClick={() => setSelectedId(`text-${slot}-price`)}
        onTap={() => setSelectedId(`text-${slot}-price`)}
        onDragEnd={(e) => setElement(slot, 'price', { x: e.target.x(), y: e.target.y() })}
        onTransformEnd={(e) => {
          const node = e.target;
          const scaleX = node.scaleX();
          node.scaleX(1);
          node.scaleY(1);
          setElement(slot, 'price', {
            x: node.x(),
            y: node.y(),
            fontSize: Math.max(10, el.fontSize * scaleX),
          });
        }}
      >
        {/* R$: Label - Small and aligned with the main price */}
        <Text
          text="R$:"
          fontSize={el.fontSize * 0.25}
          fill={el.color}
          fontStyle={`${el.isBold ? 'bold' : ''} ${el.isItalic ? 'italic' : ''}`.trim() || 'normal'}
          fontFamily={el.fontFamily || 'Inter'}
          y={el.fontSize * 0.5}
        />
        
        {/* Main Value and Cents - Large and bold */}
        <Text
          text={`${mainValue},${cents}`}
          x={el.fontSize * 0.45}
          fontSize={el.fontSize}
          fill={el.color}
          fontStyle={`${el.isBold ? 'bold' : ''} ${el.isItalic ? 'italic' : ''}`.trim() || 'normal'}
          fontFamily={el.fontFamily || 'Inter'}
          letterSpacing={-2}
        />

        {/* cada text - aligned with the last digit at the bottom */}
        <Text
          text="cada"
          x={el.fontSize * 0.45 + (mainValue.length + cents.length + 1) * el.fontSize * 0.52 - el.fontSize * 0.6}
          y={el.fontSize * 0.92}
          width={el.fontSize * 0.6}
          align="right"
          fontSize={el.fontSize * 0.18}
          fill={el.color}
          fontStyle={`${el.isBold ? 'bold' : ''} ${el.isItalic ? 'italic' : ''}`.trim() || 'normal'}
          fontFamily={el.fontFamily || 'Inter'}
        />
      </Group>
    );
  };

  const renderProduct = (slot: 1 | 2 | 3) => {
    const textElements = slot === 1 ? textElements1 : slot === 2 ? textElements2 : textElements3;
    const productImage = slot === 1 ? productImage1 : slot === 2 ? productImage2 : productImage3;
    const prodImg = slot === 1 ? prodImg1 : slot === 2 ? prodImg2 : prodImg3;
    const imgRef = slot === 1 ? productImg1Ref : slot === 2 ? productImg2Ref : productImg3Ref;

    const currentLayout = layouts[activeLayoutIndex];
    const isThree = isThreeProduct(currentLayout?.name || '', activeLayoutIndex);
    const isUltra = currentLayout?.name?.toUpperCase() === 'PADRÃO ULTRA';

    if (!productImage.visible || (slot > 1 && isSingleProduct)) return null;

    const hasThird = currentLayout?.hasThirdProduct || isThree;
    
    if (slot === 3 && !hasThird) return null;

    // Calculate aspect ratio maintained dimensions to prevent stretching
    let displayWidth = productImage.width;
    let displayHeight = productImage.height;
    let displayX = productImage.x;
    let displayY = productImage.y;

    if (prodImg && prodImg.width > 0 && prodImg.height > 0) {
      const imageAspect = prodImg.width / prodImg.height;
      const targetAspect = productImage.width / productImage.height;

      if (imageAspect > targetAspect) {
        // Image is wider than target box - fit to width
        displayHeight = productImage.width / imageAspect;
        displayY += (productImage.height - displayHeight) / 2;
      } else {
        // Image is taller than target box - fit to height
        displayWidth = productImage.height * imageAspect;
        displayX += (productImage.width - displayWidth) / 2;
      }
    }

    return (
      <Group key={`product-slot-${slot}`}>
        {/* Product Image */}
        {prodImg && productImage.visible && (
          <KonvaImage
            key={`prod-img-${slot}`}
            id={`product${slot}`}
            ref={imgRef}
            image={prodImg}
            x={displayX}
            y={displayY}
            width={displayWidth}
            height={displayHeight}
            rotation={productImage.rotation}
            opacity={productImage.opacity}
            draggable={!productImage.locked}
            onClick={() => setSelectedId(`product${slot}`)}
            onTap={() => setSelectedId(`product${slot}`)}
            onDragEnd={(e) => {
              const node = e.target;
              // Compensate for centering offset when saving position
              const xOffset = (productImage.width - displayWidth) / 2;
              const yOffset = (productImage.height - displayHeight) / 2;
              setProductImage(slot, { 
                x: node.x() - xOffset, 
                y: node.y() - yOffset 
              });
            }}
            onTransformEnd={(e) => {
              const node = imgRef.current;
              const scaleX = node.scaleX();
              const scaleY = node.scaleY();
              node.scaleX(1);
              node.scaleY(1);
              
              // Save the new dimensions (which will now have the correct aspect ratio)
              setProductImage(slot, {
                x: node.x(),
                y: node.y(),
                width: Math.max(5, node.width() * scaleX),
                height: Math.max(5, node.height() * scaleY),
                rotation: node.rotation(),
              });
            }}
          />
        )}

        {/* Text Elements */}
        {(Object.keys(textElements) as Array<keyof typeof textElements1>).map((key) => {
          const el = textElements[key as keyof typeof textElements];
          if (!el.visible) return null;
          
          if (key === 'price') return renderPrice(slot, el, `${slot}-${key}`);

          const isSelected = selectedId === `text-${slot}-${String(key)}`;

          return (
            <Group key={`${slot}-${String(key)}`}>
              {/* Visual box like Excel when selected - Hidden when printing */}
              {isSelected && !isPrinting && (
                <Rect
                  x={el.x - 5}
                  y={el.y - 5}
                  width={el.width + 10}
                  height={el.fontSize * 1.5} // Approximate height
                  stroke="#3b82f6"
                  strokeWidth={1}
                  dash={[5, 5]}
                />
              )}
              <Text
                id={`text-${slot}-${String(key)}`}
                text={el.text}
                x={el.x}
                y={el.y}
                fontSize={el.fontSize}
                fill={el.color}
                fontStyle={`${el.isBold ? 'bold' : ''} ${el.isItalic ? 'italic' : ''}`.trim() || 'normal'}
                fontFamily={el.fontFamily || 'Inter'}
                align={el.align}
                width={el.width || 700}
                lineHeight={1.2}
                draggable
                wrap="word"
                onClick={() => setSelectedId(`text-${slot}-${String(key)}`)}
                onTap={() => setSelectedId(`text-${slot}-${String(key)}`)}
                onDragEnd={(e) => {
                  setElement(slot, key as any, { x: e.target.x(), y: e.target.y() });
                }}
                onTransformEnd={(e) => {
                  const node = e.target;
                  const scaleX = node.scaleX();
                  node.scaleX(1);
                  node.scaleY(1);
                  setElement(slot, key as any, {
                    x: node.x(),
                    y: node.y(),
                    width: Math.max(5, node.width() * scaleX),
                  });
                }}
              />
            </Group>
          );
        })}
      </Group>
    );
  };

  return (
    <div ref={containerRef} className="relative flex flex-col justify-center items-center bg-zinc-100 dark:bg-zinc-900 overflow-hidden h-full max-h-full">
      {/* Zoom Controls */}
      {!isPrinting && (
        <div className="absolute bottom-6 right-6 z-50 flex items-center gap-3 bg-white dark:bg-zinc-800 p-2 rounded-full shadow-lg border border-zinc-200 dark:border-zinc-700 no-print">
          <button 
            onClick={() => setZoom(Math.max(0.1, zoom - 0.1))}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300"
          >
            -
          </button>
          <input 
            type="range" 
            min="0.1" 
            max="3" 
            step="0.1" 
            value={zoom} 
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="w-24 accent-blue-500"
          />
          <button 
            onClick={() => setZoom(Math.min(3, zoom + 0.1))}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300"
          >
            +
          </button>
          <span className="text-xs font-medium text-zinc-500 w-10 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button 
            onClick={() => setZoom(1)}
            className="px-2 py-1 text-[10px] uppercase tracking-wider font-bold bg-zinc-100 dark:bg-zinc-700 rounded hover:bg-zinc-200 dark:hover:bg-zinc-600"
          >
            Reset
          </button>
        </div>
      )}

      <div className={`flex-1 w-full overflow-auto flex items-center justify-center ${isPrinting ? 'p-0 m-0 bg-white' : 'p-8'}`}>
        <AnimatePresence mode="wait">
          <motion.div 
            key={activeLayoutIndex}
            id={id}
            initial={isPrinting ? { opacity: 1 } : { opacity: 0.8, scale: 0.98 }}
            animate={isPrinting ? { opacity: 1 } : { opacity: 1, scale: 1 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className={`bg-white ${isPrinting ? 'shadow-none' : 'shadow-2xl transition-shadow duration-300 ease-out'}`}
            style={{ 
              width: isPrinting ? currentWidth : currentWidth * autoScale * zoom, 
              height: isPrinting ? currentHeight : currentHeight * autoScale * zoom,
              transformOrigin: 'top left'
            }}
          >
        <Stage
          width={isPrinting ? currentWidth : currentWidth * autoScale * zoom}
          height={isPrinting ? currentHeight : currentHeight * autoScale * zoom}
          scaleX={isPrinting ? 1 : autoScale * zoom}
          scaleY={isPrinting ? 1 : autoScale * zoom}
          ref={stageRef}
          pixelRatio={2}
          onMouseDown={(e) => {
            if (e.target === e.target.getStage()) {
              setSelectedId(null);
              return;
            }
          }}
        >
          <Layer>
            {/* Background */}
            {displayedBg?.img && (
              <KonvaImage
                image={displayedBg.img}
                width={currentWidth}
                height={currentHeight}
                crop={(() => {
                  const img = displayedBg.img;
                  const scale = Math.max(currentWidth / img.width, currentHeight / img.height);
                  const cropWidth = currentWidth / scale;
                  const cropHeight = currentHeight / scale;
                  return {
                    x: (img.width - cropWidth) / 2,
                    y: (img.height - cropHeight) / 2,
                    width: cropWidth,
                    height: cropHeight
                  };
                })()}
                onMouseDown={() => setSelectedId(null)}
              />
            )}

            {isBgLoading && (
              <Rect 
                width={currentWidth}
                height={currentHeight}
                fill="rgba(255,255,255,0.5)"
              />
            )}

            {/* Single Product Overlay - Blank lower half (Move it here so it's behind products) */}
            {isSingleProduct && (
              <Rect
                x={0}
                y={currentHeight / 2}
                width={currentWidth}
                height={currentHeight / 2}
                fill="white"
                listening={false}
              />
            )}

            {renderProduct(1)}
            {renderProduct(2)}
            {renderProduct(3)}

            {/* Optional Text */}
            <>
              {optionalText1.active && (
                  <Group
                    id="optional-text-1"
                    x={optionalText1.x}
                    y={optionalText1.y}
                    draggable
                    onClick={() => setSelectedId('optional-text-1')}
                    onTap={() => setSelectedId('optional-text-1')}
                    onDragEnd={(e) => setOptionalText(1, { x: e.target.x(), y: e.target.y() })}
                    onTransformEnd={(e) => {
                      const node = e.target;
                      const scaleX = node.scaleX();
                      node.scaleX(1);
                      node.scaleY(1);
                      setOptionalText(1, {
                        x: node.x(),
                        y: node.y(),
                        fontSize: Math.max(10, optionalText1.fontSize * scaleX),
                      });
                    }}
                  >
                    <Text
                      text={optionalText1.text || 'Texto Opcional 1'}
                      fontSize={optionalText1.fontSize}
                      fill={optionalText1.color}
                      fontStyle={`${optionalText1.isBold ? 'bold' : ''} ${optionalText1.isItalic ? 'italic' : ''}`.trim() || 'normal'}
                      fontFamily={optionalText1.fontFamily || 'Inter'}
                      align="center"
                      width={300}
                    />
                  </Group>
                )}
                {!isSingleProduct && optionalText2.active && (
                  <Group
                    id="optional-text-2"
                    x={optionalText2.x}
                    y={optionalText2.y}
                    draggable
                    onClick={() => setSelectedId('optional-text-2')}
                    onTap={() => setSelectedId('optional-text-2')}
                    onDragEnd={(e) => setOptionalText(2, { x: e.target.x(), y: e.target.y() })}
                    onTransformEnd={(e) => {
                      const node = e.target;
                      const scaleX = node.scaleX();
                      node.scaleX(1);
                      node.scaleY(1);
                      setOptionalText(2, {
                        x: node.x(),
                        y: node.y(),
                        fontSize: Math.max(10, optionalText2.fontSize * scaleX),
                      });
                    }}
                  >
                    <Text
                      text={optionalText2.text || 'Texto Opcional 2'}
                      fontSize={optionalText2.fontSize}
                      fill={optionalText2.color}
                      fontStyle={`${optionalText2.isBold ? 'bold' : ''} ${optionalText2.isItalic ? 'italic' : ''}`.trim() || 'normal'}
                      fontFamily={optionalText2.fontFamily || 'Inter'}
                      align="center"
                      width={300}
                    />
                  </Group>
                )}
                {!isSingleProduct && optionalText3.active && (
                  <Group
                    id="optional-text-3"
                    x={optionalText3.x}
                    y={optionalText3.y}
                    draggable
                    onClick={() => setSelectedId('optional-text-3')}
                    onTap={() => setSelectedId('optional-text-3')}
                    onDragEnd={(e) => setOptionalText(3, { x: e.target.x(), y: e.target.y() })}
                    onTransformEnd={(e) => {
                      const node = e.target;
                      const scaleX = node.scaleX();
                      node.scaleX(1);
                      node.scaleY(1);
                      setOptionalText(3, {
                        x: node.x(),
                        y: node.y(),
                        fontSize: Math.max(10, optionalText3.fontSize * scaleX),
                      });
                    }}
                  >
                    <Text
                      text={optionalText3.text || 'Texto Opcional 3'}
                      fontSize={optionalText3.fontSize}
                      fill={optionalText3.color}
                      fontStyle={`${optionalText3.isBold ? 'bold' : ''} ${optionalText3.isItalic ? 'italic' : ''}`.trim() || 'normal'}
                      fontFamily={optionalText3.fontFamily || 'Inter'}
                      align="center"
                      width={300}
                    />
                  </Group>
                )}
              </>
            

            {selectedId && !isPrinting && (
              <Transformer
                ref={trRef}
                enabledAnchors={
                  selectedId.includes('price') || selectedId.startsWith('product') || selectedId.startsWith('optional-text')
                    ? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
                    : ['middle-left', 'middle-right']
                }
                rotateEnabled={!selectedId.includes('price')}
                boundBoxFunc={(oldBox, newBox) => {
                  if (Math.abs(newBox.width) < 5 || Math.abs(newBox.height) < 5) {
                    return oldBox;
                  }
                  return newBox;
                }}
              />
            )}
          </Layer>
        </Stage>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default CanvasPreview;
