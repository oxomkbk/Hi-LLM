'use client'
import { Crop } from '@gravity-ui/icons'
import { Button, Modal } from '@heroui/react'
import { useState } from 'react'
import Cropper from 'react-easy-crop'

import { getCroppedImg } from '@/lib/crop-image'

import type { FileWithPreview } from '@/hooks/use-file-upload'
import type { UseOverlayStateReturn } from '@heroui/react'
import type { FC } from 'react'
import type { Area, Point } from 'react-easy-crop'

const MIN_ZOOM = 0.5
const MAX_ZOOM = 5
const ZOOM_STEP = 0.1

interface CropLogoModalProps {
  state: UseOverlayStateReturn
  image: string | null
  onConfirm: (file: FileWithPreview) => void
}

const CropLogoModal: FC<CropLogoModalProps> = ({ state, image, onConfirm }) => {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [processing, setProcessing] = useState(false)

  /**
   * @description: 裁剪完成
   */
  function onCropComplete(_: Area, croppedPixels: Area) {
    setCroppedAreaPixels(croppedPixels)
  }

  /**
   * @description: 确认裁剪
   */
  const handleCropConfirm = async () => {
    if (!image || !croppedAreaPixels)
      return
    setProcessing(true)
    try {
      const file = await getCroppedImg(
        image,
        croppedAreaPixels,
      )
      const preview = URL.createObjectURL(file)
      const newFile: FileWithPreview = {
        id: crypto.randomUUID(),
        file,
        preview,
      }
      onConfirm(newFile)
      state.close()
    }
    finally {
      setProcessing(false)
    }
  }

  const onReset = () => {
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setRotation(0)
  }
  return (
    <Modal.Backdrop isDismissable={!processing} isKeyboardDismissDisabled={processing} isOpen={state.isOpen} onOpenChange={state.setOpen}>
      <Modal.Container placement="auto">
        <Modal.Dialog className="sm:max-w-lg">
          <Modal.CloseTrigger aria-label="关闭裁剪窗口" onPress={state.close} />
          <Modal.Header>
            <Modal.Icon className="bg-accent-soft text-accent-soft-foreground">
              <Crop className="size-5" />
            </Modal.Icon>
            <Modal.Heading>Logo 裁剪</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="py-4 px-1">
            <div className="relative h-100">
              {image && (
                <Cropper
                  aspect={1}
                  crop={crop}
                  image={image}
                  maxZoom={MAX_ZOOM}
                  minZoom={MIN_ZOOM}
                  restrictPosition={false}
                  rotation={rotation}
                  zoom={zoom}
                  zoomSpeed={ZOOM_STEP}
                  onCropChange={setCrop}
                  onCropComplete={onCropComplete}
                  onRotationChange={setRotation}
                  onZoomChange={setZoom}
                />
              )}
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline" isDisabled={processing} slot="close">取消</Button>
            <Button variant="tertiary" isDisabled={processing} onPress={onReset}>重置</Button>
            <Button isPending={processing} onPress={handleCropConfirm}>确认</Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
export default CropLogoModal
