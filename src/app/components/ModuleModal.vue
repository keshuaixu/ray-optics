<!--
  Copyright 2025 The Ray Optics Simulation authors and contributors

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<template>
  <div class="modal fade" id="moduleModal" data-bs-backdrop="false" data-bs-keyboard="false" tabindex="-1" aria-labelledby="staticBackdropLabel_module" aria-hidden="true">
    <div class="modal-backdrop fade" :class="{ show: isModalOpen }" @click="closeModal"></div>
    <div class="modal-dialog modal-dialog-centered modal-lg">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="staticBackdropLabel_module" v-html="$t('simulator:moduleModal.title')"></h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body module-modal-body">
          <div class="module-modal-tabs">
            <button
              type="button"
              class="btn btn-sm"
              :class="activeTab === 'catalog' ? 'btn-primary' : 'btn-outline-secondary'"
              @click="activeTab = 'catalog'"
              v-html="$t('simulator:moduleModal.tabs.catalog')"
            ></button>
            <button
              type="button"
              class="btn btn-sm"
              :class="activeTab === 'zemax' ? 'btn-primary' : 'btn-outline-secondary'"
              @click="activeTab = 'zemax'"
              v-html="$t('simulator:moduleModal.tabs.zemax')"
            ></button>
          </div>

          <div v-if="activeTab === 'catalog'" class="module-modal-panel">
            <iframe id="moduleIframe" loading="lazy" :src="modulesUrl"></iframe>
          </div>

          <div v-else class="module-modal-panel zemax-panel">
            <p class="zemax-description" v-html="$t('simulator:moduleModal.zemax.description')"></p>

            <div v-if="zemaxError" class="alert alert-warning zemax-alert" role="alert">
              {{ zemaxError }}
            </div>

            <div v-if="zemaxBusy" class="zemax-empty text-muted">
              {{ $t('simulator:moduleModal.zemax.loading') }}
            </div>

            <div v-else-if="zemaxEntries.length === 0" class="zemax-empty text-muted">
              {{ $t('simulator:moduleModal.zemax.empty') }}
            </div>

            <div v-else class="zemax-entry-list">
              <article v-for="entry in zemaxEntries" :key="entry.id" class="zemax-entry card">
                <div class="card-body">
                  <div class="zemax-entry-header">
                    <div>
                      <h6 class="zemax-entry-title">{{ entry.name }}</h6>
                      <div class="small text-muted">
                        <span v-if="entry.sourceFileName">{{ entry.sourceFileName }}</span>
                        <span v-if="entry.sourceFileName && entry.moduleName"> · </span>
                        <code v-if="entry.moduleName">{{ entry.moduleName }}</code>
                      </div>
                      <div class="small text-muted">
                        {{ formatEntrySummary(entry) }}
                      </div>
                    </div>
                    <div class="zemax-entry-actions">
                      <button type="button" class="btn btn-sm btn-primary" @click="insertZemaxEntry(entry)">
                        {{ $t('simulator:moduleModal.zemax.insert') }}
                      </button>
                      <button type="button" class="btn btn-sm btn-outline-danger" @click="removeZemaxEntry(entry)">
                        {{ $t('simulator:moduleModal.zemax.delete') }}
                      </button>
                    </div>
                  </div>

                  <details class="zemax-details">
                    <summary>{{ $t('simulator:moduleModal.zemax.details') }}</summary>

                    <div v-if="entry.diagnostics?.warnings?.length" class="zemax-details-section">
                      <div class="fw-bold">{{ $t('simulator:moduleModal.zemax.warnings') }}</div>
                      <ul class="zemax-list">
                        <li v-for="warningText in entry.diagnostics.warnings" :key="warningText">{{ warningText }}</li>
                      </ul>
                    </div>

                    <div v-if="entry.metadataSummary?.notes?.length" class="zemax-details-section">
                      <div class="fw-bold">{{ $t('simulator:moduleModal.zemax.notes') }}</div>
                      <ul class="zemax-list">
                        <li v-for="note in entry.metadataSummary.notes" :key="note">{{ note }}</li>
                      </ul>
                    </div>

                    <div v-if="entry.metadataSummary?.surfaces?.length" class="zemax-details-section">
                      <div class="fw-bold">{{ $t('simulator:moduleModal.zemax.surfaces') }}</div>
                      <div class="zemax-surface-list">
                        <div v-for="surface in entry.metadataSummary.surfaces" :key="surface.index" class="zemax-surface-line">
                          {{ formatSurfaceSummary(surface) }}
                        </div>
                      </div>
                    </div>
                  </details>
                </div>
              </article>
            </div>
          </div>
        </div>
        <div class="modal-footer d-flex justify-content-between">
          <div v-if="activeTab === 'catalog'">
            <button
              type="button"
              class="btn btn-outline-secondary me-2"
              v-tooltip-popover:[tooltipType]="{ content: $t('simulator:moduleModal.importFromFile.description'), placement: 'top' }"
              @click="importFromSceneFile"
              v-html="$t('simulator:moduleModal.importFromFile.title')"
            ></button>
            <input type="file" ref="jsonFileInput" accept=".json" style="display: none" @change="handleJsonFileSelect" />
          </div>
          <div v-else>
            <button
              type="button"
              class="btn btn-outline-secondary me-2"
              v-tooltip-popover:[tooltipType]="{ content: $t('simulator:moduleModal.zemax.uploadDescription'), placement: 'top' }"
              @click="importZemaxFile"
            >
              {{ $t('simulator:moduleModal.zemax.upload') }}
            </button>
            <input type="file" ref="zemaxFileInput" accept=".zmx" multiple style="display: none" @change="handleZemaxFileSelect" />
          </div>
          <div>
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal" v-html="$t('simulator:common.closeButton')"></button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
/**
 * @module ModuleModal
 * @description The Vue component for the pop-up modal for Tools -> Other -> Import Modules.
 */
import { ref, onMounted, computed, toRef } from 'vue'
import { mapURL } from '../utils/links.js'
import { vTooltipPopover } from '../directives/tooltip-popover.js'
import { usePreferencesStore } from '../store/preferences.js'
import * as bootstrap from 'bootstrap'
import i18next from 'i18next'
import { app } from '../services/app.js'
import {
  deleteZemaxLibraryEntry,
  importZemaxArrayBufferToLibrary,
  isZemaxLibrarySupported,
  listZemaxLibraryEntries
} from '../services/zemaxLibrary.js'

export default {
  name: 'ModuleModal',
  directives: {
    'tooltip-popover': vTooltipPopover
  },
  setup() {
    const isModalOpen = ref(false)
    const activeTab = ref('catalog')
    const jsonFileInput = ref(null)
    const zemaxFileInput = ref(null)
    const zemaxEntries = ref([])
    const zemaxBusy = ref(false)
    const zemaxError = ref('')
    const preferences = usePreferencesStore()
    const help = toRef(preferences, 'help')
    const tooltipType = computed(() => (help.value ? 'popover' : null))

    const closeModal = () => {
      const modal = document.getElementById('moduleModal')
      modal.classList.remove('show')
      modal.setAttribute('aria-hidden', 'true')
      modal.style.display = 'none'
      isModalOpen.value = false
    }

    const modulesUrl = mapURL('/modules/modules')

    const loadZemaxEntries = async () => {
      if (!isZemaxLibrarySupported()) {
        zemaxEntries.value = []
        zemaxError.value = i18next.t('simulator:moduleModal.zemax.unsupported')
        return
      }

      zemaxBusy.value = true
      zemaxError.value = ''
      try {
        zemaxEntries.value = await listZemaxLibraryEntries()
      } catch (err) {
        console.error(err)
        zemaxError.value = err?.message || i18next.t('simulator:moduleModal.zemax.loadError')
      } finally {
        zemaxBusy.value = false
      }
    }

    onMounted(() => {
      const modal = document.getElementById('moduleModal')
      modal.addEventListener('show.bs.modal', () => {
        isModalOpen.value = true
        loadZemaxEntries()
      })
      modal.addEventListener('hide.bs.modal', () => {
        isModalOpen.value = false
      })
    })

    const importFromSceneFile = () => {
      jsonFileInput.value.click()
    }

    const handleJsonFileSelect = (event) => {
      const file = event.target.files[0]
      if (!file) return

      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const jsonData = JSON.parse(e.target.result)
          if (app.importModulesFromSceneFile(jsonData)) {
            const modalEl = document.getElementById('moduleModal')
            const bsModal = bootstrap.Modal.getInstance(modalEl)
            if (bsModal) {
              bsModal.hide()
            } else {
              closeModal()
            }
          } else {
            alert(i18next.t('simulator:moduleModal.importFromFile.error'))
          }
        } catch (err) {
          console.error(err)
          alert(i18next.t('simulator:moduleModal.importFromFile.error'))
        }
      }
      reader.onerror = () => {
        alert(i18next.t('simulator:moduleModal.importFromFile.error'))
      }
      reader.readAsText(file)
      event.target.value = ''
    }

    const importZemaxFile = () => {
      zemaxFileInput.value.click()
    }

    const handleZemaxFileSelect = async (event) => {
      const files = Array.from(event.target.files || [])
      if (files.length === 0) return

      zemaxBusy.value = true
      zemaxError.value = ''
      const importErrors = []
      try {
        for (const file of files) {
          try {
            await importZemaxArrayBufferToLibrary({
              arrayBuffer: await file.arrayBuffer(),
              fileName: file.name
            })
          } catch (err) {
            console.error(err)
            importErrors.push(`${file.name}: ${err?.message || i18next.t('simulator:moduleModal.zemax.importError')}`)
          }
        }

        await loadZemaxEntries()
        if (importErrors.length > 0) {
          zemaxError.value = importErrors.join(' ')
        }
      } catch (err) {
        console.error(err)
        zemaxError.value = err?.message || i18next.t('simulator:moduleModal.zemax.importError')
      } finally {
        zemaxBusy.value = false
        event.target.value = ''
      }
    }

    const insertZemaxEntry = (entry) => {
      zemaxError.value = ''
      const inserted = app.insertModuleLibraryRecord(entry)
      if (!inserted) {
        return
      }

      const modalEl = document.getElementById('moduleModal')
      const bsModal = bootstrap.Modal.getInstance(modalEl)
      if (bsModal) {
        bsModal.hide()
      } else {
        closeModal()
      }
    }

    const removeZemaxEntry = async (entry) => {
      zemaxBusy.value = true
      zemaxError.value = ''
      try {
        await deleteZemaxLibraryEntry(entry.id)
        zemaxEntries.value = zemaxEntries.value.filter((candidate) => candidate.id !== entry.id)
      } catch (err) {
        console.error(err)
        zemaxError.value = err?.message || i18next.t('simulator:moduleModal.zemax.deleteError')
      } finally {
        zemaxBusy.value = false
      }
    }

    const formatEntrySummary = (entry) => {
      const surfaceCount = entry?.metadataSummary?.surfaces?.length || 0
      const regionCount = entry?.metadataSummary?.regionCount || 0
      const glassNames = entry?.metadataSummary?.glassNames || []
      const warningCount = entry?.diagnostics?.warnings?.length || 0
      const summaryParts = [
        i18next.t('simulator:moduleModal.zemax.summary.surfaceCount', { count: surfaceCount }),
        i18next.t('simulator:moduleModal.zemax.summary.regionCount', { count: regionCount })
      ]
      if (glassNames.length > 0) {
        summaryParts.push(glassNames.join(', '))
      }
      if (warningCount > 0) {
        summaryParts.push(i18next.t('simulator:moduleModal.zemax.summary.warningCount', { count: warningCount }))
      }
      return summaryParts.join(' • ')
    }

    const formatSurfaceSummary = (surface) => {
      const parts = [
        `S${surface.index}`,
        `TYPE ${surface.type || 'STANDARD'}`,
        `CURV ${surface.curvature}`,
        `THICK ${surface.thickness}`
      ]
      if (surface.conic != null && Math.abs(surface.conic) > 1e-12) {
        parts.push(`CONI ${surface.conic}`)
      }
      if (surface.glassName) {
        parts.push(surface.glassName)
      }
      if (surface.semiDiameter != null) {
        parts.push(`SD ${surface.semiDiameter}`)
      }
      if (surface.clearSemiDiameter != null) {
        parts.push(`CA ${surface.clearSemiDiameter}`)
      }
      if (surface.stop) {
        parts.push(i18next.t('simulator:moduleModal.zemax.stopTag'))
      }
      if (surface.coat) {
        parts.push(`COAT ${surface.coat}`)
      }
      return parts.join(' · ')
    }

    return {
      activeTab,
      closeModal,
      formatEntrySummary,
      formatSurfaceSummary,
      handleJsonFileSelect,
      handleZemaxFileSelect,
      importFromSceneFile,
      importZemaxFile,
      insertZemaxEntry,
      isModalOpen,
      jsonFileInput,
      modulesUrl,
      removeZemaxEntry,
      tooltipType,
      zemaxBusy,
      zemaxEntries,
      zemaxError,
      zemaxFileInput
    }
  }
}
</script>

<style scoped>
#moduleIframe {
  width: 100%;
  height: 500px;
  max-height: 70vh;
  border: none;
}

.module-modal-body {
  padding: 0 !important;
}

.module-modal-tabs {
  display: flex;
  gap: 0.5rem;
  padding: 1rem 1rem 0;
}

.module-modal-panel {
  padding: 1rem;
}

.zemax-panel {
  max-height: 70vh;
  overflow-y: auto;
}

.zemax-description {
  margin-bottom: 1rem;
}

.zemax-alert,
.zemax-empty {
  margin-bottom: 0.75rem;
}

.zemax-entry-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.zemax-entry-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

.zemax-entry-title {
  margin-bottom: 0.15rem;
}

.zemax-entry-actions {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
  align-items: flex-start;
}

.zemax-details {
  margin-top: 0.75rem;
}

.zemax-details-section + .zemax-details-section {
  margin-top: 0.75rem;
}

.zemax-list {
  margin: 0.35rem 0 0;
  padding-left: 1.1rem;
}

.zemax-surface-list {
  margin-top: 0.35rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-family: monospace;
  font-size: 0.85rem;
}

.modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.3);
  z-index: 1040;
}

.modal-backdrop.show {
  opacity: 1;
}

.modal-dialog {
  z-index: 1045;
}

@media (max-width: 767px) {
  .zemax-entry-header {
    flex-direction: column;
  }

  .zemax-entry-actions {
    width: 100%;
  }
}
</style>
