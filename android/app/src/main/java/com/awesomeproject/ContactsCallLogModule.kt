package com.awesomeproject

import android.content.ContentResolver
import android.database.Cursor
import android.os.Build
import android.provider.CallLog
import android.provider.ContactsContract
import android.provider.Settings
import com.facebook.react.bridge.*

class ContactsCallLogModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "ContactsCallLogModule"

    @ReactMethod
    fun getDeviceInfo(promise: Promise) {
        try {
            // ANDROID_ID: unique 64-bit hex string per device + app signing key.
            // Remains stable across reboots (resets only on factory reset).
            val androidId = Settings.Secure.getString(
                reactApplicationContext.contentResolver,
                Settings.Secure.ANDROID_ID
            ) ?: "unknown"

            val info = Arguments.createMap()
            info.putString("androidId", androidId)
            info.putString("manufacturer", Build.MANUFACTURER)       // e.g. "Samsung"
            info.putString("model", Build.MODEL)                     // e.g. "SM-G991B"
            info.putString("brand", Build.BRAND)                     // e.g. "samsung"
            info.putString("device", Build.DEVICE)                   // e.g. "o1s"
            info.putString("sdkVersion", Build.VERSION.SDK_INT.toString())

            val manufacturer = Build.MANUFACTURER.orEmpty()
            val model = Build.MODEL.orEmpty()
            val label = if (model.lowercase().startsWith(manufacturer.lowercase())) {
                model.replaceFirstChar { it.uppercase() }
            } else {
                "${manufacturer.replaceFirstChar { it.uppercase() }} $model".trim()
            }
            info.putString("label", label)

            promise.resolve(info)
        } catch (e: Exception) {
            promise.reject("DEVICE_INFO_ERROR", "Failed to get device info: ${e.message}", e)
        }
    }

    @ReactMethod
    fun getContacts(promise: Promise) {
        try {
            val contacts = Arguments.createArray()
            val contentResolver: ContentResolver = reactApplicationContext.contentResolver

            val projection = arrayOf(
                ContactsContract.CommonDataKinds.Phone.CONTACT_ID,
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                ContactsContract.CommonDataKinds.Phone.NUMBER,
                ContactsContract.CommonDataKinds.Phone.PHOTO_URI
            )

            val cursor: Cursor? = contentResolver.query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                projection,
                null,
                null,
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " ASC"
            )

            // Use a set to deduplicate by contact ID
            val seenIds = mutableSetOf<String>()

            cursor?.use {
                val idIndex = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.CONTACT_ID)
                val nameIndex = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)
                val numberIndex = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER)
                val photoIndex = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.PHOTO_URI)

                while (it.moveToNext()) {
                    val contactId = it.getString(idIndex) ?: continue
                    if (seenIds.contains(contactId)) continue
                    seenIds.add(contactId)

                    val contact = Arguments.createMap()
                    contact.putString("id", contactId)
                    contact.putString("name", it.getString(nameIndex) ?: "Unknown")
                    contact.putString("phoneNumber", it.getString(numberIndex) ?: "")
                    contact.putString("photoUri", it.getString(photoIndex))
                    contacts.pushMap(contact)
                }
            }

            promise.resolve(contacts)
        } catch (e: Exception) {
            promise.reject("CONTACTS_ERROR", "Failed to load contacts: ${e.message}", e)
        }
    }

    @ReactMethod
    fun getCallLog(limit: Int, promise: Promise) {
        try {
            val callLogs = Arguments.createArray()
            val contentResolver: ContentResolver = reactApplicationContext.contentResolver

            val projection = arrayOf(
                CallLog.Calls._ID,
                CallLog.Calls.NUMBER,
                CallLog.Calls.CACHED_NAME,
                CallLog.Calls.TYPE,
                CallLog.Calls.DATE,
                CallLog.Calls.DURATION
            )

            val cursor: Cursor? = contentResolver.query(
                CallLog.Calls.CONTENT_URI,
                projection,
                null,
                null,
                CallLog.Calls.DATE + " DESC"
            )

            cursor?.use {
                val idIndex = it.getColumnIndex(CallLog.Calls._ID)
                val numberIndex = it.getColumnIndex(CallLog.Calls.NUMBER)
                val nameIndex = it.getColumnIndex(CallLog.Calls.CACHED_NAME)
                val typeIndex = it.getColumnIndex(CallLog.Calls.TYPE)
                val dateIndex = it.getColumnIndex(CallLog.Calls.DATE)
                val durationIndex = it.getColumnIndex(CallLog.Calls.DURATION)

                var count = 0
                while (it.moveToNext() && count < limit) {
                    val entry = Arguments.createMap()
                    entry.putString("id", it.getString(idIndex) ?: count.toString())
                    entry.putString("phoneNumber", it.getString(numberIndex) ?: "Unknown")
                    entry.putString("name", it.getString(nameIndex) ?: "")
                    entry.putDouble("dateTimestamp", it.getLong(dateIndex).toDouble())
                    entry.putInt("duration", it.getInt(durationIndex))

                    val callType = when (it.getInt(typeIndex)) {
                        CallLog.Calls.INCOMING_TYPE -> "INCOMING"
                        CallLog.Calls.OUTGOING_TYPE -> "OUTGOING"
                        CallLog.Calls.MISSED_TYPE -> "MISSED"
                        CallLog.Calls.REJECTED_TYPE -> "REJECTED"
                        CallLog.Calls.BLOCKED_TYPE -> "BLOCKED"
                        CallLog.Calls.VOICEMAIL_TYPE -> "VOICEMAIL"
                        else -> "UNKNOWN"
                    }
                    entry.putString("type", callType)

                    callLogs.pushMap(entry)
                    count++
                }
            }

            promise.resolve(callLogs)
        } catch (e: Exception) {
            promise.reject("CALL_LOG_ERROR", "Failed to load call log: ${e.message}", e)
        }
    }
}

