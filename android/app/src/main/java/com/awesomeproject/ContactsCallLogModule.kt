package com.awesomeproject

import android.content.ContentResolver
import android.database.Cursor
import android.provider.CallLog
import android.provider.ContactsContract
import com.facebook.react.bridge.*

class ContactsCallLogModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "ContactsCallLogModule"

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

